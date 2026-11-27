import { and, asc, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm'
import type { Ingredient, IngredientInputParsed, PackageUnit } from '../../shared/schemas/ingredient'
import { ulid } from '../../shared/ulid'
import type { Db } from '../db/client'
import { escapeLike } from '../db/like'
import { ingredients, packageUnits } from '../db/schema'
import { ApiError } from '../errors'

type IngredientRow = typeof ingredients.$inferSelect
type PackageUnitRow = typeof packageUnits.$inferSelect

function toPackageUnit(row: PackageUnitRow): PackageUnit {
  return { id: row.id, label: row.label, quantity: row.quantity, isDefault: row.isDefault }
}

function toIngredient(row: IngredientRow, units: PackageUnitRow[]): Ingredient {
  return {
    id: row.id,
    name: row.name,
    aliases: row.aliases,
    category: row.category,
    unit: row.unit,
    gramsPerUnit: row.gramsPerUnit,
    canFreeze: row.canFreeze,
    fridgeDays: row.fridgeDays,
    freezerDays: row.freezerDays,
    pantryDays: row.pantryDays,
    preppedFridgeDays: row.preppedFridgeDays,
    preppedFreezerDays: row.preppedFreezerDays,
    defaultLocation: row.defaultLocation,
    beforeCookTask: row.beforeCookTask,
    frozenCookNote: row.frozenCookNote,
    isStaple: row.isStaple,
    packageUnits: units.map(toPackageUnit),
  }
}

/** 代表の販売単位がちょうど 1 つになるようにする（指定がなければ先頭を代表にする） */
export function normalizeDefaultUnit<T extends { isDefault: boolean }>(units: T[]): T[] {
  if (units.length === 0) return units
  const defaultIndex = Math.max(
    0,
    units.findIndex((u) => u.isDefault),
  )
  return units.map((u, i) => ({ ...u, isDefault: i === defaultIndex }))
}

function ingredientValues(input: IngredientInputParsed) {
  const { packageUnits: _, ...rest } = input
  return rest
}

function findByName(db: Db, name: string) {
  return db.query.ingredients.findFirst({ where: eq(ingredients.name, name) })
}

async function assertNameAvailable(db: Db, name: string, exceptId?: string) {
  const existing = await findByName(db, name)
  if (existing && existing.id !== exceptId) {
    throw new ApiError(
      409,
      'DUPLICATE_NAME',
      existing.archivedAt ? `「${name}」は削除済みの食材にあります` : `「${name}」はすでに登録されています`,
    )
  }
}

export async function listIngredients(db: Db, opts: { q?: string; category?: string } = {}): Promise<Ingredient[]> {
  const conditions = [isNull(ingredients.archivedAt)]
  if (opts.category) conditions.push(eq(ingredients.category, opts.category as IngredientRow['category']))
  if (opts.q) {
    const like = `%${escapeLike(opts.q)}%`
    conditions.push(
      sql`(${ingredients.name} LIKE ${like} ESCAPE '\\' OR ${ingredients.aliases} LIKE ${like} ESCAPE '\\')`,
    )
  }
  const rows = await db
    .select()
    .from(ingredients)
    .where(and(...conditions))
    .orderBy(asc(ingredients.category), asc(ingredients.name))
  if (rows.length === 0) return []
  const units = await db
    .select()
    .from(packageUnits)
    .where(
      inArray(
        packageUnits.ingredientId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(packageUnits.quantity))
  return rows.map((r) =>
    toIngredient(
      r,
      units.filter((u) => u.ingredientId === r.id),
    ),
  )
}

export async function getIngredient(db: Db, id: string): Promise<Ingredient> {
  const row = await db.query.ingredients.findFirst({
    where: and(eq(ingredients.id, id), isNull(ingredients.archivedAt)),
  })
  if (!row) throw new ApiError(404, 'NOT_FOUND', '食材が見つかりません')
  const units = await db
    .select()
    .from(packageUnits)
    .where(eq(packageUnits.ingredientId, id))
    .orderBy(asc(packageUnits.quantity))
  return toIngredient(row, units)
}

/**
 * 食材を登録する。同じ名前の削除済み食材があれば、その行を復活させて入力値で上書きする
 * （レシピや在庫からの参照を保ったまま使い直せるようにするため。販売単位は入力どおりに置き換える）
 */
export async function createIngredient(db: Db, input: IngredientInputParsed): Promise<Ingredient> {
  const existing = await findByName(db, input.name)
  if (existing && !existing.archivedAt) {
    throw new ApiError(409, 'DUPLICATE_NAME', `「${input.name}」はすでに登録されています`)
  }
  if (existing) {
    const units = normalizeDefaultUnit(input.packageUnits)
    await db.batch([
      db
        .update(ingredients)
        .set({ ...ingredientValues(input), archivedAt: null })
        .where(eq(ingredients.id, existing.id)),
      db.delete(packageUnits).where(eq(packageUnits.ingredientId, existing.id)),
      ...units.map(({ id: _, ...u }) => db.insert(packageUnits).values({ ingredientId: existing.id, ...u })),
    ])
    return getIngredient(db, existing.id)
  }
  const id = ulid()
  const units = normalizeDefaultUnit(input.packageUnits)
  await db.batch([
    db.insert(ingredients).values({ id, ...ingredientValues(input) }),
    ...units.map(({ id: _, ...u }) => db.insert(packageUnits).values({ ingredientId: id, ...u })),
  ])
  return getIngredient(db, id)
}

/**
 * 食材を丸ごと更新する。販売単位は id があれば更新、なければ追加、送られてこなかったものは削除。
 * （買い物リストから参照されている販売単位を消すと、その行の販売単位は NULL になる）
 */
export async function updateIngredient(db: Db, id: string, input: IngredientInputParsed): Promise<Ingredient> {
  const current = await getIngredient(db, id)
  await assertNameAvailable(db, input.name, id)

  const units = normalizeDefaultUnit(input.packageUnits)
  const currentIds = new Set(current.packageUnits.map((u) => u.id))
  const keptIds = units.flatMap((u) => (u.id && currentIds.has(u.id) ? [u.id] : []))

  await db.batch([
    db.update(ingredients).set(ingredientValues(input)).where(eq(ingredients.id, id)),
    db
      .delete(packageUnits)
      .where(
        keptIds.length > 0
          ? and(eq(packageUnits.ingredientId, id), notInArray(packageUnits.id, keptIds))
          : eq(packageUnits.ingredientId, id),
      ),
    ...units.map(({ id: unitId, ...u }) =>
      unitId && currentIds.has(unitId)
        ? db.update(packageUnits).set(u).where(eq(packageUnits.id, unitId))
        : db.insert(packageUnits).values({ ingredientId: id, ...u }),
    ),
  ])
  return getIngredient(db, id)
}

/** 論理削除（レシピや在庫から参照されていても消せる。一覧と候補から消えるだけ） */
export async function archiveIngredient(db: Db, id: string): Promise<void> {
  await getIngredient(db, id)
  await db.update(ingredients).set({ archivedAt: new Date().toISOString() }).where(eq(ingredients.id, id))
}
