import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm'
import { computeExpiresOn, expiryOf } from '../../shared/domain/expiry'
import { allocateReservations } from '../../shared/domain/reservations'
import type { StorageLocation } from '../../shared/schemas/ingredient'
import type {
  FridgeEntry,
  InventoryCreateInput,
  InventoryItem,
  InventoryPatchInput,
} from '../../shared/schemas/inventory'
import type { Db } from '../db/client'
import { ingredients, inventoryItems, mealKitItems, mealKits, recipes } from '../db/schema'
import { ApiError } from '../errors'

/** 数量の表示（小数第 2 位まで、末尾の 0 は消す） */
export function formatQuantity(quantity: number, unit: string): string {
  return `${Number(quantity.toFixed(2))}${unit}`
}

/** stored の袋が直前作業用に確保している量（食べる予定日の早い袋から） */
async function listReservations(db: Db) {
  const rows = await db
    .select({ ingredientId: mealKitItems.ingredientId, quantity: mealKitItems.quantity, label: recipes.title })
    .from(mealKitItems)
    .innerJoin(mealKits, eq(mealKits.id, mealKitItems.mealKitId))
    .innerJoin(recipes, eq(recipes.id, mealKits.recipeId))
    .where(and(eq(mealKits.status, 'stored'), eq(mealKitItems.state, 'before_cook'), isNotNull(mealKitItems.quantity)))
    .orderBy(asc(mealKits.plannedOn), asc(mealKits.id))
  return rows.map((r) => ({ ingredientId: r.ingredientId, quantity: r.quantity ?? 0, label: r.label }))
}

/** 現在の在庫（使い切っていないもの）。期限の近い順 */
export async function listInventory(db: Db, today: string): Promise<InventoryItem[]> {
  const rows = await db
    .select({
      id: inventoryItems.id,
      ingredientId: inventoryItems.ingredientId,
      name: ingredients.name,
      unit: ingredients.unit,
      category: ingredients.category,
      quantity: inventoryItems.quantity,
      location: inventoryItems.location,
      purchasedOn: inventoryItems.purchasedOn,
      expiresOn: inventoryItems.expiresOn,
      source: inventoryItems.source,
    })
    .from(inventoryItems)
    .innerJoin(ingredients, eq(ingredients.id, inventoryItems.ingredientId))
    .where(isNull(inventoryItems.usedUpAt))
    .orderBy(asc(inventoryItems.expiresOn), asc(ingredients.name), asc(inventoryItems.id))
  const reserved = allocateReservations(rows, await listReservations(db))
  return rows.map((r) => {
    const e = expiryOf(r.expiresOn, today)
    const res = reserved.get(r.id)
    return {
      ...r,
      daysLeft: e.daysLeft,
      isExpiringSoon: e.isExpiringSoon,
      expiryStatus: e.status,
      reservedQuantity: res?.reservedQuantity ?? 0,
      reservedFor: res?.reservedFor ?? [],
    }
  })
}

export async function getInventoryItem(db: Db, id: string, today: string): Promise<InventoryItem> {
  const item = (await listInventory(db, today)).find((i) => i.id === id)
  if (!item) throw new ApiError(404, 'NOT_FOUND', '在庫が見つかりません')
  return item
}

async function getMaster(db: Db, ingredientId: string) {
  const master = await db.query.ingredients.findFirst({ where: eq(ingredients.id, ingredientId) })
  if (!master) throw new ApiError(400, 'UNKNOWN_INGREDIENT', '食材マスタにない食材です')
  return master
}

function assertLocation(master: { name: string; canFreeze: boolean }, location: StorageLocation) {
  if (location === 'freezer' && !master.canFreeze) {
    throw new ApiError(400, 'CANNOT_FREEZE', `「${master.name}」は冷凍できない食材です`)
  }
}

/** 手で在庫を足す。期限は省略時に購入日 + 保存場所の日持ちで計算する */
export async function createInventoryItem(db: Db, input: InventoryCreateInput, today: string): Promise<InventoryItem> {
  const master = await getMaster(db, input.ingredientId)
  if (master.archivedAt) throw new ApiError(400, 'UNKNOWN_INGREDIENT', '削除済みの食材です')
  const location = input.location ?? master.defaultLocation
  assertLocation(master, location)
  const purchasedOn = input.purchasedOn ?? today
  const [row] = await db
    .insert(inventoryItems)
    .values({
      ingredientId: master.id,
      quantity: input.quantity,
      location,
      purchasedOn,
      expiresOn: input.expiresOn ?? computeExpiresOn(purchasedOn, location, master),
      source: 'manual',
    })
    .returning({ id: inventoryItems.id })
  if (!row) throw new Error('在庫を追加できませんでした')
  return getInventoryItem(db, row.id, today)
}

/**
 * 量・場所・期限を直す。量を 0 にすると使い切り（null を返す）。
 * 期限を指定せずに場所だけ変えたら、購入日から期限を計算し直す（冷凍すれば延びる）。
 */
export async function updateInventoryItem(
  db: Db,
  id: string,
  input: InventoryPatchInput,
  today: string,
): Promise<InventoryItem | null> {
  const current = await db.query.inventoryItems.findFirst({
    where: and(eq(inventoryItems.id, id), isNull(inventoryItems.usedUpAt)),
  })
  if (!current) throw new ApiError(404, 'NOT_FOUND', '在庫が見つかりません')
  const master = await getMaster(db, current.ingredientId)

  const location = input.location ?? current.location
  assertLocation(master, location)
  const expiresOn =
    input.expiresOn ??
    (input.location && input.location !== current.location
      ? computeExpiresOn(current.purchasedOn, location, master)
      : current.expiresOn)

  const usedUp = input.quantity === 0
  await db
    .update(inventoryItems)
    .set({
      quantity: input.quantity ?? current.quantity,
      location,
      expiresOn,
      usedUpAt: usedUp ? new Date().toISOString() : null,
    })
    .where(eq(inventoryItems.id, id))
  return usedUp ? null : getInventoryItem(db, id, today)
}

export async function useUpInventoryItem(db: Db, id: string): Promise<void> {
  const current = await db.query.inventoryItems.findFirst({
    where: and(eq(inventoryItems.id, id), isNull(inventoryItems.usedUpAt)),
  })
  if (!current) throw new ApiError(404, 'NOT_FOUND', '在庫が見つかりません')
  await db.update(inventoryItems).set({ usedUpAt: new Date().toISOString() }).where(eq(inventoryItems.id, id))
}

/** 冷蔵庫ビュー: 在庫と保存中の袋を合わせ、期限の近い順に返す */
export async function listFridge(
  db: Db,
  today: string,
  opts: { location?: StorageLocation; kind?: FridgeEntry['kind']; expiringSoon?: boolean } = {},
): Promise<FridgeEntry[]> {
  const entries: FridgeEntry[] = []
  if (opts.kind !== 'meal_kit') {
    for (const i of await listInventory(db, today)) {
      entries.push({
        kind: 'ingredient',
        id: i.id,
        name: i.name,
        quantityText: formatQuantity(i.quantity, i.unit),
        location: i.location,
        expiresOn: i.expiresOn,
        daysLeft: i.daysLeft,
        isExpiringSoon: i.isExpiringSoon,
        expiryStatus: i.expiryStatus,
        reservedFor:
          i.reservedFor.length > 0
            ? `${i.reservedFor.join('・')}の袋用${i.reservedQuantity < i.quantity ? `（${formatQuantity(i.reservedQuantity, i.unit)}）` : ''}`
            : null,
        plannedOn: null,
      })
    }
  }
  if (opts.kind !== 'ingredient') {
    const kits = await db
      .select({
        id: mealKits.id,
        title: recipes.title,
        servings: mealKits.servings,
        location: mealKits.location,
        useBy: mealKits.useBy,
        plannedOn: mealKits.plannedOn,
      })
      .from(mealKits)
      .innerJoin(recipes, eq(recipes.id, mealKits.recipeId))
      .where(eq(mealKits.status, 'stored'))
    for (const k of kits) {
      const e = expiryOf(k.useBy, today)
      entries.push({
        kind: 'meal_kit',
        id: k.id,
        name: k.title,
        quantityText: `${Number(k.servings.toFixed(2))}食分`,
        location: k.location,
        expiresOn: k.useBy,
        daysLeft: e.daysLeft,
        isExpiringSoon: e.isExpiringSoon,
        expiryStatus: e.status,
        reservedFor: null,
        plannedOn: k.plannedOn,
      })
    }
  }
  return entries
    .filter((e) => !opts.location || e.location === opts.location)
    .filter((e) => !opts.expiringSoon || e.isExpiringSoon)
    .sort((a, b) => a.expiresOn.localeCompare(b.expiresOn) || a.name.localeCompare(b.name, 'ja'))
}
