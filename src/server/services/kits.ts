import { and, asc, eq, inArray } from 'drizzle-orm'
import { addDays } from '../../shared/domain/date'
import {
  buildKit,
  consumeStock,
  type KitDraft,
  type KitLocation,
  type PrepIngredient,
  type PrepRecipe,
  summarizePrep,
} from '../../shared/domain/prep'
import type { KitsInput, PrepView, Shortage } from '../../shared/schemas/kit'
import { ulid } from '../../shared/ulid'
import type { Db } from '../db/client'
import {
  ingredients,
  inventoryItems,
  mealKitItems,
  mealKits,
  planRecipes,
  plans,
  recipeIngredients,
  recipes,
} from '../db/schema'
import { ApiError } from '../errors'
import { listInventory } from './inventory'

function isUniqueViolation(err: unknown): boolean {
  for (let e: unknown = err; e instanceof Error; e = e.cause) {
    if (/UNIQUE constraint failed/i.test(e.message)) return true
  }
  return false
}

async function findPrepping(db: Db, planId: string) {
  const plan = await db.query.plans.findFirst({ where: eq(plans.id, planId) })
  if (!plan) throw new ApiError(404, 'NOT_FOUND', '献立が見つかりません')
  if (plan.status !== 'prepping' || !plan.startsOn) {
    throw new ApiError(409, 'INVALID_STATE', '下ごしらえ中の献立ではありません')
  }
  return { ...plan, startsOn: plan.startsOn }
}

/** 献立の料理（食べる日つき）と、使う食材のマスタ */
async function loadInputs(db: Db, planId: string, startsOn: string) {
  const rows = await db
    .select({
      recipeId: planRecipes.recipeId,
      title: recipes.title,
      recipeServings: recipes.servings,
      servings: planRecipes.servings,
      dayIndex: planRecipes.dayIndex,
      packSeasonings: recipes.packSeasonings,
    })
    .from(planRecipes)
    .innerJoin(recipes, eq(recipes.id, planRecipes.recipeId))
    .where(eq(planRecipes.planId, planId))
    .orderBy(asc(planRecipes.dayIndex))
  const recipeIds = rows.map((r) => r.recipeId)
  const parts =
    recipeIds.length === 0
      ? []
      : await db
          .select({
            recipeId: recipeIngredients.recipeId,
            ingredientId: recipeIngredients.ingredientId,
            quantity: recipeIngredients.quantity,
            cutStyle: recipeIngredients.cutStyle,
            displayText: recipeIngredients.displayText,
          })
          .from(recipeIngredients)
          .where(inArray(recipeIngredients.recipeId, recipeIds))
          .orderBy(asc(recipeIngredients.sortOrder))
  const ingredientIds = [...new Set(parts.map((p) => p.ingredientId))]
  const masters =
    ingredientIds.length === 0 ? [] : await db.select().from(ingredients).where(inArray(ingredients.id, ingredientIds))
  const prepIngredients = new Map<string, PrepIngredient>(
    masters.map((m) => [
      m.id,
      {
        id: m.id,
        name: m.name,
        unit: m.unit,
        category: m.category,
        isStaple: m.isStaple,
        canFreeze: m.canFreeze,
        preppedFridgeDays: m.preppedFridgeDays,
        preppedFreezerDays: m.preppedFreezerDays,
        beforeCookTask: m.beforeCookTask,
      },
    ]),
  )
  const prepRecipes: PrepRecipe[] = rows.map((r) => ({
    recipeId: r.recipeId,
    title: r.title,
    recipeServings: r.recipeServings,
    servings: r.servings,
    plannedOn: addDays(startsOn, r.dayIndex - 1),
    packSeasonings: r.packSeasonings,
    ingredients: parts
      .filter((p) => p.recipeId === r.recipeId)
      .map(({ ingredientId, quantity, cutStyle, displayText }) => ({ ingredientId, quantity, cutStyle, displayText })),
  }))
  return { prepRecipes, prepIngredients }
}

function buildAll(
  prepRecipes: PrepRecipe[],
  prepIngredients: Map<string, PrepIngredient>,
  today: string,
  locations: Map<string, KitLocation>,
): KitDraft[] {
  return prepRecipes.map((r) => buildKit(r, prepIngredients, today, locations.get(r.recipeId)))
}

/** 袋に入れる（packed / seasoning_packed）量。在庫から減らす対象 */
function packNeeds(kits: KitDraft[]) {
  return kits.flatMap((k) =>
    k.items
      .filter((i) => i.tracked && i.state !== 'before_cook' && i.quantity !== null)
      .map((i) => ({ ingredientId: i.ingredientId, quantity: i.quantity as number })),
  )
}

/** 直前に使う分（袋用に確保する量） */
function beforeCookNeeds(kits: KitDraft[]) {
  return kits.flatMap((k) =>
    k.items
      .filter((i) => i.tracked && i.state === 'before_cook' && i.quantity !== null)
      .map((i) => ({ ingredientId: i.ingredientId, quantity: i.quantity as number })),
  )
}

/** 減らせる在庫（他の袋の直前作業用に確保している分は除く） */
async function consumable(db: Db, today: string) {
  const items = await listInventory(db, today)
  return {
    rows: items.map((i) => ({
      id: i.id,
      ingredientId: i.ingredientId,
      quantity: Math.max(0, i.quantity - i.reservedQuantity),
      expiresOn: i.expiresOn,
    })),
    reserved: new Map(items.map((i) => [i.id, Math.min(i.quantity, i.reservedQuantity)])),
    names: new Map(items.map((i) => [i.ingredientId, { name: i.name, unit: i.unit }])),
  }
}

function toShortages(shortages: Map<string, number>, kits: KitDraft[], kind: Shortage['kind']): Shortage[] {
  const info = new Map(kits.flatMap((k) => k.items.map((i) => [i.ingredientId, i] as const)))
  return [...shortages].map(([ingredientId, quantity]) => ({
    ingredientId,
    name: info.get(ingredientId)?.name ?? '',
    unit: info.get(ingredientId)?.unit ?? '',
    quantity,
    kind,
  }))
}

/** 下ごしらえ（S05）と袋詰め（S06）の下書き。locations を省略した料理は初期値の保存場所 */
export async function previewPrep(
  db: Db,
  planId: string,
  today: string,
  locations: Map<string, KitLocation> = new Map(),
): Promise<PrepView> {
  const plan = await findPrepping(db, planId)
  const { prepRecipes, prepIngredients } = await loadInputs(db, planId, plan.startsOn)
  const kits = buildAll(prepRecipes, prepIngredients, today, locations)
  const { rows } = await consumable(db, today)
  const packed = consumeStock(rows, packNeeds(kits))
  // 袋に入れた残りで、直前に使う分（確保する分）が足りるか
  const left = new Map(packed.updates.map((u) => [u.id, u.quantity]))
  const after = rows.map((r) => ({ ...r, quantity: left.get(r.id) ?? r.quantity }))
  const beforeCook = consumeStock(after, beforeCookNeeds(kits))
  return {
    kits,
    prep: summarizePrep(kits),
    shortages: [
      ...toShortages(packed.shortages, kits, 'pack'),
      ...toShortages(beforeCook.shortages, kits, 'before_cook'),
    ],
  }
}

/**
 * 袋を保存する。1 つの batch で、袋と中身を作り、袋に入れた分を在庫から減らし、prepping → stored にする。
 * 直前作業（before_cook）の食材は減らさず、袋の行が確保として残る
 */
export async function saveKits(db: Db, planId: string, input: KitsInput, today: string): Promise<KitDraft[]> {
  const plan = await findPrepping(db, planId)
  const { prepRecipes, prepIngredients } = await loadInputs(db, planId, plan.startsOn)
  const known = new Set(prepRecipes.map((r) => r.recipeId))
  const unknown = input.kits.filter((k) => !known.has(k.recipeId)).map((k) => k.recipeId)
  if (unknown.length > 0) throw new ApiError(400, 'UNKNOWN_RECIPE', '献立にない料理です', { recipeIds: unknown })
  const kits = buildAll(prepRecipes, prepIngredients, today, new Map(input.kits.map((k) => [k.recipeId, k.location])))
  const { rows, reserved } = await consumable(db, today)
  const { updates } = consumeStock(rows, packNeeds(kits))
  const now = new Date().toISOString()

  const kitRows = kits.map((k) => ({
    id: ulid(),
    planId,
    recipeId: k.recipeId,
    servings: k.servings,
    location: k.location,
    packedOn: k.packedOn,
    plannedOn: k.plannedOn,
    useBy: k.useBy,
  }))
  const itemRows = kits.flatMap((k, i) =>
    k.items.map((item) => ({
      mealKitId: kitRows[i]?.id as string,
      ingredientId: item.ingredientId,
      quantity: item.quantity,
      state: item.state,
      beforeCookTask: item.beforeCookTask,
    })),
  )
  try {
    await db.batch([
      db
        .update(plans)
        .set({ status: 'stored' })
        .where(and(eq(plans.id, planId), eq(plans.status, 'prepping'))),
      db.insert(mealKits).values(kitRows),
      ...(itemRows.length > 0 ? [db.insert(mealKitItems).values(itemRows)] : []),
      ...updates.map((u) => {
        const quantity = u.quantity + (reserved.get(u.id) ?? 0)
        return db
          .update(inventoryItems)
          .set(quantity <= 1e-9 ? { quantity: 0, usedUpAt: now } : { quantity })
          .where(eq(inventoryItems.id, u.id))
      }),
    ])
  } catch (err) {
    // 同じ献立の袋がもうある = 二重に届いた 2 本目。batch ごと巻き戻っている
    if (isUniqueViolation(err)) throw new ApiError(409, 'INVALID_STATE', 'この献立の袋はもう保存されています')
    throw err
  }
  return kits
}
