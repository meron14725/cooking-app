import { and, asc, eq, inArray, isNull, lte, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { DEFAULT_PREPPED_FREEZER_DAYS, DEFAULT_PREPPED_FRIDGE_DAYS } from '../../shared/domain/constants'
import { addDays } from '../../shared/domain/date'
import { expiryOf } from '../../shared/domain/expiry'
import { consumeStock } from '../../shared/domain/prep'
import { roundQuantity } from '../../shared/domain/units'
import type { CookView, KitCookedInput, KitPatchInput, KitStatus, MealKit } from '../../shared/schemas/kit'
import type { Db } from '../db/client'
import {
  ingredients,
  inventoryItems,
  mealKitItems,
  mealKits,
  plans,
  recipeIngredients,
  recipeSteps,
  recipes,
} from '../db/schema'
import { ApiError } from '../errors'

export async function listKits(
  db: Db,
  today: string,
  opts: { status?: KitStatus; plannedOnOrBefore?: string } = {},
): Promise<MealKit[]> {
  const rows = await db
    .select({
      id: mealKits.id,
      planId: mealKits.planId,
      recipeId: mealKits.recipeId,
      title: recipes.title,
      servings: mealKits.servings,
      location: mealKits.location,
      packedOn: mealKits.packedOn,
      plannedOn: mealKits.plannedOn,
      useBy: mealKits.useBy,
      status: mealKits.status,
    })
    .from(mealKits)
    .innerJoin(recipes, eq(recipes.id, mealKits.recipeId))
    .where(
      and(
        eq(mealKits.status, opts.status ?? 'stored'),
        opts.plannedOnOrBefore ? lte(mealKits.plannedOn, opts.plannedOnOrBefore) : undefined,
      ),
    )
    .orderBy(asc(mealKits.plannedOn), asc(mealKits.useBy), asc(recipes.title))
  const ids = rows.map((r) => r.id)
  const items =
    ids.length === 0
      ? []
      : await db
          .select({
            mealKitId: mealKitItems.mealKitId,
            ingredientId: mealKitItems.ingredientId,
            name: ingredients.name,
            unit: ingredients.unit,
            quantity: mealKitItems.quantity,
            state: mealKitItems.state,
            beforeCookTask: mealKitItems.beforeCookTask,
          })
          .from(mealKitItems)
          .innerJoin(ingredients, eq(ingredients.id, mealKitItems.ingredientId))
          .where(inArray(mealKitItems.mealKitId, ids))
          .orderBy(asc(mealKitItems.createdAt), asc(mealKitItems.id))
  return rows.map((r) => {
    const e = expiryOf(r.useBy, today)
    return {
      ...r,
      daysLeft: e.daysLeft,
      expiryStatus: e.status,
      items: items.filter((i) => i.mealKitId === r.id).map(({ mealKitId: _, ...i }) => i),
    }
  })
}

export async function getKit(db: Db, id: string, today: string): Promise<MealKit> {
  const row = await db.query.mealKits.findFirst({ where: eq(mealKits.id, id), columns: { status: true } })
  if (!row) throw new ApiError(404, 'NOT_FOUND', '袋が見つかりません')
  const kit = (await listKits(db, today, { status: row.status })).find((k) => k.id === id)
  if (!kit) throw new ApiError(404, 'NOT_FOUND', '袋が見つかりません')
  return kit
}

function assertStored(kit: { status: KitStatus }) {
  if (kit.status !== 'stored') throw new ApiError(409, 'INVALID_STATE', 'この袋はもう使い終わっています')
}

/** 直前に使う量（在庫から減らす分） */
function beforeCookNeeds(kit: MealKit) {
  return kit.items
    .filter((i) => i.state === 'before_cook' && i.quantity !== null)
    .map((i) => ({ ingredientId: i.ingredientId, quantity: i.quantity as number }))
}

async function stockRows(db: Db, ingredientIds: string[]) {
  if (ingredientIds.length === 0) return []
  return db
    .select({
      id: inventoryItems.id,
      ingredientId: inventoryItems.ingredientId,
      quantity: inventoryItems.quantity,
      expiresOn: inventoryItems.expiresOn,
      name: ingredients.name,
      unit: ingredients.unit,
      isStaple: ingredients.isStaple,
    })
    .from(inventoryItems)
    .innerJoin(ingredients, eq(ingredients.id, inventoryItems.ingredientId))
    .where(and(inArray(inventoryItems.ingredientId, ingredientIds), isNull(inventoryItems.usedUpAt)))
    .orderBy(asc(inventoryItems.expiresOn), asc(inventoryItems.id))
}

/** 調理画面（S08）: 直前作業 → 入れる順 → ホットクックの設定 → 冷凍の注意 → 余りの見込み */
export async function getCookView(db: Db, id: string, today: string): Promise<CookView> {
  const kit = await getKit(db, id, today)
  const [recipe, parts, steps] = await Promise.all([
    db.query.recipes.findFirst({ where: eq(recipes.id, kit.recipeId) }),
    db
      .select({
        ingredientId: recipeIngredients.ingredientId,
        name: ingredients.name,
        displayText: recipeIngredients.displayText,
        quantity: recipeIngredients.quantity,
        unit: ingredients.unit,
        addOrder: recipeIngredients.addOrder,
        sortOrder: recipeIngredients.sortOrder,
        frozenCookNote: ingredients.frozenCookNote,
      })
      .from(recipeIngredients)
      .innerJoin(ingredients, eq(ingredients.id, recipeIngredients.ingredientId))
      .where(eq(recipeIngredients.recipeId, kit.recipeId))
      .orderBy(asc(recipeIngredients.addOrder), asc(recipeIngredients.sortOrder)),
    db
      .select({ text: recipeSteps.text })
      .from(recipeSteps)
      .where(and(eq(recipeSteps.recipeId, kit.recipeId), eq(recipeSteps.phase, 'cook')))
      .orderBy(asc(recipeSteps.stepNo)),
  ])
  const state = new Map(kit.items.map((i) => [i.ingredientId, i.state]))
  const factor = recipe ? kit.servings / recipe.servings : 1
  const addOrder = parts.map((p) => {
    const s = state.get(p.ingredientId)
    const from: CookView['addOrder'][number]['from'] =
      s === 'packed' || s === 'seasoning_packed' ? 'kit' : s === 'before_cook' ? 'before_cook' : 'now'
    // 量は袋の食数に合わせる（レシピの表記は元の人数分なので、量がないときだけ使う）
    const quantity = p.quantity === null ? null : roundQuantity(p.quantity * factor)
    return { ingredientId: p.ingredientId, name: p.name, displayText: p.displayText, quantity, unit: p.unit, from }
  })

  const frozenNotes: string[] = []
  if (kit.location === 'freezer') {
    frozenNotes.push('袋は冷凍のまま入れられます。解凍する場合は前日に冷蔵庫へ移してください')
    for (const p of parts) {
      if (p.frozenCookNote && state.get(p.ingredientId) === 'packed') frozenNotes.push(`${p.name}: ${p.frozenCookNote}`)
    }
  }

  const needs = beforeCookNeeds(kit)
  const rows = (await stockRows(db, [...new Set(needs.map((n) => n.ingredientId))])).filter((r) => !r.isStaple)
  const { updates } = consumeStock(rows, needs)
  const after = new Map(updates.map((u) => [u.id, u.quantity]))
  const expectedLeftovers = rows.map((r) => ({
    inventoryItemId: r.id,
    name: r.name,
    unit: r.unit,
    quantity: after.get(r.id) ?? r.quantity,
  }))

  return {
    kit,
    hotcookMode: recipe?.hotcookMode ?? null,
    beforeCook: kit.items
      .filter((i) => i.state === 'before_cook')
      .map((i) => ({
        ingredientId: i.ingredientId,
        name: i.name,
        unit: i.unit,
        quantity: i.quantity,
        task: i.beforeCookTask ?? '',
      }))
      // 入れる順に並べる
      .sort(
        (a, b) =>
          parts.findIndex((p) => p.ingredientId === a.ingredientId) -
          parts.findIndex((p) => p.ingredientId === b.ingredientId),
      ),
    addOrder,
    cookSteps: steps.map((s) => s.text),
    frozenNotes,
    notes: recipe?.notes ?? null,
    expectedLeftovers,
  }
}

/** 献立の袋が全部使い終わっていれば done にする文（batch の最後に入れる。何度走っても同じ結果） */
function completePlanIfDone(db: Db, planId: string, now: string) {
  return db
    .update(plans)
    .set({ status: 'done', completedAt: now })
    .where(
      and(
        eq(plans.id, planId),
        eq(plans.status, 'stored'),
        sql`NOT EXISTS (SELECT 1 FROM meal_kits WHERE plan_id = ${planId} AND status = 'stored')`,
      ),
    )
}

/**
 * 作った: 直前作業で使った分を在庫から減らし（期限の近い行から）、余りの修正を反映し、袋を cooked にする。
 * batch は 1 つのトランザクションなので、在庫の更新を「袋がまだ stored なら」の条件つきで先に、袋の更新を後に置く。
 * 二重に届いても、2 本目は袋がもう cooked なので在庫を動かさない
 */
export async function cookKit(db: Db, id: string, input: KitCookedInput, today: string): Promise<MealKit> {
  const kit = await getKit(db, id, today)
  assertStored(kit)
  const needs = beforeCookNeeds(kit)
  const rows = (await stockRows(db, [...new Set(needs.map((n) => n.ingredientId))])).filter((r) => !r.isStaple)
  const final = new Map(consumeStock(rows, needs).updates.map((u) => [u.id, u.quantity]))
  for (const l of input.leftovers) final.set(l.inventoryItemId, l.quantity)

  const now = new Date().toISOString()
  const stillStored = sql`EXISTS (SELECT 1 FROM meal_kits WHERE id = ${id} AND status = 'stored')`
  const statements: BatchItem<'sqlite'>[] = [
    ...[...final].map(([rowId, quantity]) =>
      db
        .update(inventoryItems)
        .set(quantity <= 1e-9 ? { quantity: 0, usedUpAt: now } : { quantity })
        .where(and(eq(inventoryItems.id, rowId), isNull(inventoryItems.usedUpAt), stillStored)),
    ),
    db
      .update(mealKits)
      .set({ status: 'cooked', cookedAt: now })
      .where(and(eq(mealKits.id, id), eq(mealKits.status, 'stored')))
      .returning({ id: mealKits.id }),
    completePlanIfDone(db, kit.planId, now),
  ]
  const results = await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]])
  // 袋を cooked にできなかった = 先に別のリクエストが cooked にした（このリクエストでは在庫も動いていない）
  const changed = results[final.size] as { id: string }[]
  if (changed.length === 0) throw new ApiError(409, 'INVALID_STATE', 'この袋はもう使い終わっています')
  return getKit(db, id, today)
}

/** 捨てた: 在庫は動かさない（直前作業用の確保は stored の袋だけを数えるので自動で外れる） */
export async function discardKit(db: Db, id: string, today: string): Promise<MealKit> {
  const kit = await getKit(db, id, today)
  assertStored(kit)
  const now = new Date().toISOString()
  await db.batch([
    db
      .update(mealKits)
      .set({ status: 'discarded' })
      .where(and(eq(mealKits.id, id), eq(mealKits.status, 'stored'))),
    completePlanIfDone(db, kit.planId, now),
  ])
  return getKit(db, id, today)
}

/** 保存場所・使用期限の修正。期限を指定せずに場所だけ変えたら、袋詰めの日から計算し直す */
export async function updateKit(db: Db, id: string, input: KitPatchInput, today: string): Promise<MealKit> {
  const kit = await getKit(db, id, today)
  assertStored(kit)
  const location = input.location ?? kit.location
  let useBy = input.useBy ?? kit.useBy
  if (!input.useBy && location !== kit.location) {
    const packedIds = kit.items.filter((i) => i.state === 'packed').map((i) => i.ingredientId)
    const masters =
      packedIds.length === 0 ? [] : await db.select().from(ingredients).where(inArray(ingredients.id, packedIds))
    const days = masters.map((m) =>
      location === 'fridge'
        ? (m.preppedFridgeDays ?? DEFAULT_PREPPED_FRIDGE_DAYS)
        : (m.preppedFreezerDays ?? DEFAULT_PREPPED_FREEZER_DAYS),
    )
    const fallback = location === 'fridge' ? DEFAULT_PREPPED_FRIDGE_DAYS : DEFAULT_PREPPED_FREEZER_DAYS
    useBy = addDays(kit.packedOn, days.length > 0 ? Math.min(...days) : fallback)
  }
  await db.update(mealKits).set({ location, useBy }).where(eq(mealKits.id, id))
  return getKit(db, id, today)
}
