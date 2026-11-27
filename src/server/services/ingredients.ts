import { and, asc, eq, isNotNull, isNull, lt, notInArray, sql } from 'drizzle-orm'
import { PRICE_STALE_DAYS } from '../../shared/domain/constants'
import { rescalePrice } from '../../shared/domain/cost'
import { representativeQuantity } from '../../shared/domain/recommend'
import type { Ingredient, IngredientInputParsed, PackageUnit, PriceFilter } from '../../shared/schemas/ingredient'
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
    attributesSource: row.attributesSource,
    beforeCookTask: row.beforeCookTask,
    frozenCookNote: row.frozenCookNote,
    isStaple: row.isStaple,
    priceYen: row.priceYen,
    priceSource: row.priceYen === null ? null : row.priceSource,
    priceUpdatedAt: row.priceYen === null ? null : row.priceUpdatedAt,
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
  const { packageUnits: _, priceYen: __, ...rest } = input
  return rest
}

type PriceColumns = Pick<IngredientRow, 'priceYen' | 'priceSource' | 'priceUpdatedAt'>

/** 手で入れた価格の列。null なら 3 列とも未設定に戻す */
function manualPrice(priceYen: number | null): PriceColumns {
  return priceYen === null
    ? { priceYen: null, priceSource: null, priceUpdatedAt: null }
    : { priceYen, priceSource: 'manual', priceUpdatedAt: new Date().toISOString() }
}

/**
 * 更新後の価格の列（docs/design/10-cost.md）
 * - 入力の価格が今と違う → 手入力として保存
 * - 同じか省略 → 今の値のまま。代表量が変わったら、単価が変わらないように換算する（出どころと日付はそのまま）
 */
export function nextPriceColumns(
  current: PriceColumns,
  inputPriceYen: number | null | undefined,
  oldRepresentative: number,
  newRepresentative: number,
): PriceColumns {
  if (inputPriceYen !== undefined && inputPriceYen !== current.priceYen) return manualPrice(inputPriceYen)
  if (current.priceYen === null) return { priceYen: null, priceSource: null, priceUpdatedAt: null }
  return {
    priceYen: rescalePrice(current.priceYen, oldRepresentative, newRepresentative),
    priceSource: current.priceSource,
    priceUpdatedAt: current.priceUpdatedAt,
  }
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

export async function listIngredients(
  db: Db,
  opts: { q?: string; category?: string; price?: PriceFilter; now?: Date } = {},
): Promise<Ingredient[]> {
  const conditions = [isNull(ingredients.archivedAt)]
  if (opts.price === 'missing') {
    // 常備品は金額の合計に入れないので「未設定」にも出さない
    conditions.push(isNull(ingredients.priceYen), eq(ingredients.isStaple, false))
  }
  if (opts.price === 'stale') {
    const before = new Date((opts.now ?? new Date()).getTime() - PRICE_STALE_DAYS * 86_400_000).toISOString()
    conditions.push(isNotNull(ingredients.priceYen), lt(ingredients.priceUpdatedAt, before))
  }
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
  // ID を IN に並べると D1 のバインド変数の上限（100）を超えるので、同じ条件で ingredients と JOIN して取る
  const units = (
    await db
      .select({ unit: packageUnits })
      .from(packageUnits)
      .innerJoin(ingredients, eq(ingredients.id, packageUnits.ingredientId))
      .where(and(...conditions))
      .orderBy(asc(packageUnits.quantity))
  ).map((r) => r.unit)
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
        .set({
          ...ingredientValues(input),
          ...(input.priceYen === undefined ? {} : manualPrice(input.priceYen)),
          archivedAt: null,
        })
        .where(eq(ingredients.id, existing.id)),
      db.delete(packageUnits).where(eq(packageUnits.ingredientId, existing.id)),
      ...units.map(({ id: _, ...u }) => db.insert(packageUnits).values({ ingredientId: existing.id, ...u })),
    ])
    return getIngredient(db, existing.id)
  }
  const id = ulid()
  const units = normalizeDefaultUnit(input.packageUnits)
  await db.batch([
    db.insert(ingredients).values({ id, ...ingredientValues(input), ...manualPrice(input.priceYen ?? null) }),
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
  const price = nextPriceColumns(
    current,
    input.priceYen,
    representativeQuantity(current),
    representativeQuantity({ unit: input.unit, packageUnits: units }),
  )
  const currentIds = new Set(current.packageUnits.map((u) => u.id))
  const keptIds = units.flatMap((u) => (u.id && currentIds.has(u.id) ? [u.id] : []))

  // 分類か重さを画面で変えたら manual（まとめて推定で上書きしない）
  const edited = input.category !== current.category || (input.gramsPerUnit ?? null) !== current.gramsPerUnit
  await db.batch([
    db
      .update(ingredients)
      .set({
        ...ingredientValues(input),
        ...price,
        ...(edited ? { attributesSource: 'manual' as const } : {}),
      })
      .where(eq(ingredients.id, id)),
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
