import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { computeExpiresOn } from '../../shared/domain/expiry'
import type { ShoppingLine } from '../../shared/domain/recommend'
import { roundQuantity } from '../../shared/domain/units'
import { CATEGORY_OPTIONS } from '../../shared/schemas/ingredient'
import type { PlanStatus } from '../../shared/schemas/plan'
import type { ShoppingAddInput, ShoppingItem, ShoppingList, ShoppingPatchInput } from '../../shared/schemas/shopping'
import type { Db } from '../db/client'
import {
  ingredients,
  inventoryItems,
  packageUnits,
  planRecipes,
  plans,
  recipeIngredients,
  recipes,
  shoppingItems,
} from '../db/schema'
import { ApiError } from '../errors'

const CATEGORY_ORDER = new Map<string, number>(CATEGORY_OPTIONS.map((o, i) => [o.value, i]))

/** 献立の確定と同じ batch に入れる、買い物リストの行 */
export function shoppingRowsFromLines(planId: string, lines: ShoppingLine[]) {
  return lines
    .filter((l) => l.buyQuantity > 0)
    .map((l) => ({
      planId,
      ingredientId: l.ingredientId,
      needQuantity: l.needQuantity,
      packageUnitId: l.packageUnitId,
      packageCount: l.packageCount,
      buyQuantity: l.buyQuantity,
    }))
}

async function planStatus(db: Db, planId: string): Promise<PlanStatus> {
  const row = await db.query.plans.findFirst({ where: eq(plans.id, planId), columns: { status: true } })
  if (!row) throw new ApiError(404, 'NOT_FOUND', '献立が見つかりません')
  return row.status
}

function assertShopping(status: PlanStatus) {
  if (status !== 'shopping') throw new ApiError(409, 'INVALID_STATE', '買い物中の献立ではありません')
}

export async function listShopping(db: Db, planId: string): Promise<ShoppingList> {
  await planStatus(db, planId)
  const rows = await db
    .select({
      id: shoppingItems.id,
      ingredientId: shoppingItems.ingredientId,
      name: ingredients.name,
      unit: ingredients.unit,
      category: ingredients.category,
      needQuantity: shoppingItems.needQuantity,
      packageUnitId: shoppingItems.packageUnitId,
      packageLabel: packageUnits.label,
      packageCount: shoppingItems.packageCount,
      buyQuantity: shoppingItems.buyQuantity,
      checkedAt: shoppingItems.checkedAt,
      isManual: shoppingItems.isManual,
      createdAt: shoppingItems.createdAt,
    })
    .from(shoppingItems)
    .innerJoin(ingredients, eq(ingredients.id, shoppingItems.ingredientId))
    .leftJoin(packageUnits, eq(packageUnits.id, shoppingItems.packageUnitId))
    .where(eq(shoppingItems.planId, planId))
  const [units, uses] = await Promise.all([
    // 買い物リストの食材は 100 種を超えうるので、ID を並べずにサブクエリで取る（D1 のバインド変数の上限は 100）
    rows.length === 0
      ? []
      : db
          .select()
          .from(packageUnits)
          .where(
            inArray(
              packageUnits.ingredientId,
              db.select({ id: shoppingItems.ingredientId }).from(shoppingItems).where(eq(shoppingItems.planId, planId)),
            ),
          )
          .orderBy(asc(packageUnits.quantity), asc(packageUnits.id)),
    db
      .selectDistinct({
        ingredientId: recipeIngredients.ingredientId,
        title: recipes.title,
        dayIndex: planRecipes.dayIndex,
      })
      .from(planRecipes)
      .innerJoin(recipes, eq(recipes.id, planRecipes.recipeId))
      .innerJoin(recipeIngredients, eq(recipeIngredients.recipeId, planRecipes.recipeId))
      .where(eq(planRecipes.planId, planId))
      .orderBy(asc(planRecipes.dayIndex)),
  ])
  const items: ShoppingItem[] = rows
    .sort(
      (a, b) =>
        (CATEGORY_ORDER.get(a.category) ?? 99) - (CATEGORY_ORDER.get(b.category) ?? 99) ||
        Number(a.isManual) - Number(b.isManual) ||
        a.name.localeCompare(b.name, 'ja') ||
        a.createdAt.localeCompare(b.createdAt),
    )
    .map(({ createdAt: _, ...r }) => ({
      ...r,
      usedFor: [...new Set(uses.filter((u) => u.ingredientId === r.ingredientId).map((u) => u.title))],
      packageUnits: units
        .filter((u) => u.ingredientId === r.ingredientId)
        .map((u) => ({ id: u.id, label: u.label, quantity: u.quantity })),
    }))
  return { planId, items }
}

async function findPackageUnit(db: Db, ingredientId: string, packageUnitId: string) {
  const unit = await db.query.packageUnits.findFirst({
    where: and(eq(packageUnits.id, packageUnitId), eq(packageUnits.ingredientId, ingredientId)),
  })
  if (!unit) throw new ApiError(400, 'VALIDATION_ERROR', 'この食材の販売単位ではありません')
  return unit
}

/** 手で行を足す（調味料の買い足しなど） */
export async function addShoppingItem(db: Db, planId: string, input: ShoppingAddInput): Promise<ShoppingItem> {
  assertShopping(await planStatus(db, planId))
  const master = await db.query.ingredients.findFirst({
    where: and(eq(ingredients.id, input.ingredientId), isNull(ingredients.archivedAt)),
  })
  if (!master) throw new ApiError(400, 'UNKNOWN_INGREDIENT', '食材マスタにない食材です')
  const packageCount = input.packageCount ?? 1
  const unit = input.packageUnitId ? await findPackageUnit(db, master.id, input.packageUnitId) : null
  const buyQuantity = unit ? roundQuantity(unit.quantity * packageCount) : (input.quantity ?? 0)
  const [row] = await db
    .insert(shoppingItems)
    .values({
      planId,
      ingredientId: master.id,
      needQuantity: 0,
      packageUnitId: unit?.id ?? null,
      packageCount: unit ? packageCount : 1,
      buyQuantity,
      isManual: true,
    })
    .returning({ id: shoppingItems.id })
  if (!row) throw new Error('買い物リストに追加できませんでした')
  return getShoppingItem(db, row.id)
}

async function findItem(db: Db, id: string) {
  const item = await db.query.shoppingItems.findFirst({ where: eq(shoppingItems.id, id) })
  if (!item) throw new ApiError(404, 'NOT_FOUND', '買い物リストの行が見つかりません')
  assertShopping(await planStatus(db, item.planId))
  return item
}

async function getShoppingItem(db: Db, id: string): Promise<ShoppingItem> {
  const item = await db.query.shoppingItems.findFirst({ where: eq(shoppingItems.id, id) })
  if (!item) throw new ApiError(404, 'NOT_FOUND', '買い物リストの行が見つかりません')
  const found = (await listShopping(db, item.planId)).items.find((i) => i.id === id)
  if (!found) throw new ApiError(404, 'NOT_FOUND', '買い物リストの行が見つかりません')
  return found
}

/** 買ったチェック → 在庫を作る。チェック済みなら何もしない（再送しても二重にならない） */
export async function checkShoppingItem(db: Db, id: string, today: string): Promise<ShoppingItem> {
  const item = await findItem(db, id)
  if (item.checkedAt) return getShoppingItem(db, id)
  if (item.buyQuantity <= 0) throw new ApiError(409, 'INVALID_STATE', '買う量が 0 です')
  const master = await db.query.ingredients.findFirst({ where: eq(ingredients.id, item.ingredientId) })
  if (!master) throw new ApiError(400, 'UNKNOWN_INGREDIENT', '食材マスタにない食材です')
  const location = master.defaultLocation === 'freezer' && !master.canFreeze ? 'fridge' : master.defaultLocation
  await db.batch([
    db
      .update(shoppingItems)
      .set({ checkedAt: new Date().toISOString() })
      .where(and(eq(shoppingItems.id, id), isNull(shoppingItems.checkedAt))),
    db
      .insert(inventoryItems)
      .values({
        ingredientId: master.id,
        quantity: item.buyQuantity,
        location,
        purchasedOn: today,
        expiresOn: computeExpiresOn(today, location, master),
        source: 'shopping',
        shoppingItemId: id,
      })
      // 同時に 2 本届いても、部分ユニークインデックスで 2 行目は入らない
      .onConflictDoNothing(),
  ])
  return getShoppingItem(db, id)
}

/** チェックを外す → チェックで作った在庫を消す。外れていれば何もしない */
export async function uncheckShoppingItem(db: Db, id: string): Promise<ShoppingItem> {
  const item = await findItem(db, id)
  if (!item.checkedAt) return getShoppingItem(db, id)
  await db.batch([
    db.delete(inventoryItems).where(eq(inventoryItems.shoppingItemId, id)),
    db.update(shoppingItems).set({ checkedAt: null }).where(eq(shoppingItems.id, id)),
  ])
  return getShoppingItem(db, id)
}

/** 個数・販売単位・量の修正。チェック済みなら、まだ使い切っていない在庫行の量も合わせる */
export async function updateShoppingItem(db: Db, id: string, input: ShoppingPatchInput): Promise<ShoppingItem> {
  const item = await findItem(db, id)
  const packageUnitId = input.packageUnitId === undefined ? item.packageUnitId : input.packageUnitId
  const packageCount = input.packageCount ?? item.packageCount
  const unit = packageUnitId ? await findPackageUnit(db, item.ingredientId, packageUnitId) : null
  const buyQuantity = unit
    ? roundQuantity(unit.quantity * packageCount)
    : (input.quantity ?? (input.packageCount === 0 ? 0 : item.buyQuantity))
  if (item.checkedAt && buyQuantity <= 0) {
    throw new ApiError(409, 'INVALID_STATE', '買ったものを 0 にするときは、先にチェックを外してください')
  }
  await db.batch([
    db
      .update(shoppingItems)
      .set({
        packageUnitId: unit?.id ?? null,
        packageCount: unit ? packageCount : buyQuantity > 0 ? 1 : 0,
        buyQuantity,
      })
      .where(eq(shoppingItems.id, id)),
    db
      .update(inventoryItems)
      .set({ quantity: buyQuantity })
      .where(and(eq(inventoryItems.shoppingItemId, id), isNull(inventoryItems.usedUpAt))),
  ])
  return getShoppingItem(db, id)
}

/** 行を消す（チェックしていない行だけ） */
export async function deleteShoppingItem(db: Db, id: string): Promise<void> {
  const item = await findItem(db, id)
  if (item.checkedAt) throw new ApiError(409, 'INVALID_STATE', '先にチェックを外してください')
  await db.delete(shoppingItems).where(eq(shoppingItems.id, id))
}

/** 買い物完了: shopping → prepping。チェックしていない行は残す（買わなかったもの） */
export async function completeShopping(db: Db, planId: string): Promise<void> {
  assertShopping(await planStatus(db, planId))
  await db
    .update(plans)
    .set({ status: 'prepping' })
    .where(and(eq(plans.id, planId), eq(plans.status, 'shopping')))
}
