import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { deriveAttributes, type RecipeAttributes } from '../../shared/domain/recipeAttributes'
import type {
  AttributeSource,
  Recipe,
  RecipeIngredient,
  RecipeInputParsed,
  RecipeSort,
  RecipeStep,
  RecipeSummary,
} from '../../shared/schemas/recipe'
import { ulid } from '../../shared/ulid'
import type { Db } from '../db/client'
import { escapeLike } from '../db/like'
import { ingredients, recipeIngredients, recipeSteps, recipes } from '../db/schema'
import { ApiError } from '../errors'

type RecipeRow = typeof recipes.$inferSelect

function recipeValues(input: RecipeInputParsed) {
  const {
    ingredients: _i,
    steps: _s,
    dishType: _d,
    cuisine: _c,
    usesMixingUnit: _m,
    cookMinutes: _t,
    attributesManual: _a,
    ...rest
  } = input
  return rest
}

type IngredientRow = Pick<
  typeof ingredients.$inferSelect,
  'id' | 'archivedAt' | 'name' | 'category' | 'unit' | 'gramsPerUnit' | 'isStaple'
>

const ATTRIBUTE_KEYS = ['dishType', 'cuisine', 'usesMixingUnit', 'cookMinutes'] as const

/**
 * 区分・系統・まぜ技・調理時間を決める（docs/design/09-recommendation-v2.md）。
 * - attributesManual: 入力のまま保存（manual）
 * - 手で直したレシピ: 入力で省略した欄は今の値を残す（manual のまま）
 * - それ以外: 入力の値 → ルール → AI で決めた今の値、の順。AI の値が残れば ai、なければ rule
 */
export function resolveAttributes(
  input: RecipeInputParsed,
  ingredientRows: Map<string, IngredientRow>,
  existing?: RecipeRow,
): RecipeAttributes & { attributesSource: AttributeSource } {
  if (input.attributesManual) {
    return {
      dishType: input.dishType ?? null,
      cuisine: input.cuisine ?? null,
      usesMixingUnit: input.usesMixingUnit ?? null,
      cookMinutes: input.cookMinutes ?? null,
      attributesSource: 'manual',
    }
  }
  if (existing?.attributesSource === 'manual') {
    return {
      dishType: input.dishType === undefined ? existing.dishType : input.dishType,
      cuisine: input.cuisine === undefined ? existing.cuisine : input.cuisine,
      usesMixingUnit: input.usesMixingUnit === undefined ? existing.usesMixingUnit : input.usesMixingUnit,
      cookMinutes: input.cookMinutes === undefined ? existing.cookMinutes : input.cookMinutes,
      attributesSource: 'manual',
    }
  }
  const derived = deriveAttributes(
    {
      title: input.title,
      servings: input.servings,
      hotcookMode: input.hotcookMode,
      ingredients: input.ingredients.flatMap((i) => {
        const row = ingredientRows.get(i.ingredientId)
        return row ? [{ ...row, quantity: i.quantity }] : []
      }),
    },
    {
      dishType: input.dishType,
      cuisine: input.cuisine,
      usesMixingUnit: input.usesMixingUnit,
      cookMinutes: input.cookMinutes,
    },
  )
  let usedAi = false
  if (existing?.attributesSource === 'ai') {
    for (const key of ATTRIBUTE_KEYS) {
      if (derived[key] === null && existing[key] !== null) {
        ;(derived as Record<string, unknown>)[key] = existing[key]
        usedAi = true
      }
    }
  }
  return { ...derived, attributesSource: usedAi ? 'ai' : 'rule' }
}

/**
 * 材料の食材がマスタにあるか確かめる（削除済みの食材は、すでにこのレシピで使っているものだけ許す）。
 * 区分などの判定に使うので、食材の行を返す
 */
async function assertIngredientsExist(
  db: Db,
  input: RecipeInputParsed,
  recipeId?: string,
): Promise<Map<string, IngredientRow>> {
  const ids = [...new Set(input.ingredients.map((i) => i.ingredientId))]
  const rows = await db
    .select({
      id: ingredients.id,
      archivedAt: ingredients.archivedAt,
      name: ingredients.name,
      category: ingredients.category,
      unit: ingredients.unit,
      gramsPerUnit: ingredients.gramsPerUnit,
      isStaple: ingredients.isStaple,
    })
    .from(ingredients)
    .where(inArray(ingredients.id, ids))
  const used = recipeId
    ? new Set(
        (
          await db
            .select({ id: recipeIngredients.ingredientId })
            .from(recipeIngredients)
            .where(eq(recipeIngredients.recipeId, recipeId))
        ).map((r) => r.id),
      )
    : new Set<string>()
  const ok = new Set(rows.filter((r) => !r.archivedAt || used.has(r.id)).map((r) => r.id))
  const missing = ids.filter((id) => !ok.has(id))
  if (missing.length > 0) {
    throw new ApiError(400, 'UNKNOWN_INGREDIENT', '食材マスタにない食材が含まれています', { ingredientIds: missing })
  }
  return new Map(rows.map((r) => [r.id, r]))
}

function childInserts(db: Db, recipeId: string, input: RecipeInputParsed) {
  return [
    ...input.ingredients.map((i, index) => db.insert(recipeIngredients).values({ recipeId, ...i, sortOrder: index })),
    ...input.steps.map((s, index) => db.insert(recipeSteps).values({ recipeId, ...s, stepNo: index + 1 })),
  ]
}

/** 並べ替え。件数で並べるときは件数のないレシピを後ろに、同じ件数は料理名順 */
function orderFor(sort: RecipeSort | undefined) {
  const byCount = (col: typeof recipes.favoriteCount | typeof recipes.cookCount) => [
    sql`${col} IS NULL`,
    desc(col),
    asc(recipes.title),
  ]
  // お気に入り数は取り込み元の数に自分のお気に入り（1）を足した数
  if (sort === 'popular')
    return [
      sql`(${recipes.favoriteCount} IS NULL AND ${recipes.isFavorite} = 0)`,
      desc(sql`COALESCE(${recipes.favoriteCount}, 0) + ${recipes.isFavorite}`),
      asc(recipes.title),
    ]
  if (sort === 'cooked') return byCount(recipes.cookCount)
  return [asc(recipes.title)]
}

export async function listRecipes(
  db: Db,
  opts: { q?: string; ingredientId?: string; sort?: RecipeSort } = {},
): Promise<RecipeSummary[]> {
  const conditions = [isNull(recipes.archivedAt)]
  if (opts.q) {
    // 料理名か、材料の食材名で探す
    const like = `%${escapeLike(opts.q)}%`
    conditions.push(
      sql`(${recipes.title} LIKE ${like} ESCAPE '\\' OR EXISTS (SELECT 1 FROM ${recipeIngredients} INNER JOIN ${ingredients} ON ${ingredients.id} = ${recipeIngredients.ingredientId} WHERE ${recipeIngredients.recipeId} = ${recipes.id} AND ${ingredients.name} LIKE ${like} ESCAPE '\\'))`,
    )
  }
  if (opts.ingredientId) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM ${recipeIngredients} WHERE ${recipeIngredients.recipeId} = ${recipes.id} AND ${recipeIngredients.ingredientId} = ${opts.ingredientId})`,
    )
  }
  const rows = await db
    .select()
    .from(recipes)
    .where(and(...conditions))
    .orderBy(...orderFor(opts.sort))
  if (rows.length === 0) return []

  // ID を IN に並べると D1 のバインド変数の上限（100）を超えるので、同じ条件で recipes と JOIN して取る
  const names = await db
    .select({ recipeId: recipeIngredients.recipeId, name: ingredients.name })
    .from(recipeIngredients)
    .innerJoin(recipes, eq(recipes.id, recipeIngredients.recipeId))
    .innerJoin(ingredients, eq(ingredients.id, recipeIngredients.ingredientId))
    .where(and(...conditions))
    .orderBy(asc(recipeIngredients.sortOrder))

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    servings: r.servings,
    caloriesKcal: r.caloriesKcal,
    caloriesEstimated: r.caloriesEstimated,
    hotcookMode: r.hotcookMode,
    sourceType: r.sourceType,
    packSeasonings: r.packSeasonings,
    officialMenuNo: r.officialMenuNo,
    imageKey: r.imageKey,
    favoriteCount: r.favoriteCount,
    isFavorite: r.isFavorite,
    cookCount: r.cookCount,
    dishType: r.dishType,
    cuisine: r.cuisine,
    ingredientNames: [...new Set(names.filter((n) => n.recipeId === r.id).map((n) => n.name))],
  }))
}

function toRecipe(row: RecipeRow, items: RecipeIngredient[], steps: RecipeStep[]): Recipe {
  return {
    id: row.id,
    title: row.title,
    servings: row.servings,
    caloriesKcal: row.caloriesKcal,
    caloriesEstimated: row.caloriesEstimated,
    hotcookMode: row.hotcookMode,
    maxServings1_6l: row.maxServings1_6l,
    packSeasonings: row.packSeasonings,
    sourceType: row.sourceType,
    sourceUrl: row.sourceUrl,
    notes: row.notes,
    officialMenuNo: row.officialMenuNo,
    imageKey: row.imageKey,
    favoriteCount: row.favoriteCount,
    isFavorite: row.isFavorite,
    cookCount: row.cookCount,
    score: row.score,
    dishType: row.dishType,
    cuisine: row.cuisine,
    usesMixingUnit: row.usesMixingUnit,
    cookMinutes: row.cookMinutes,
    attributesSource: row.attributesSource,
    ingredients: items,
    steps,
    updatedAt: row.updatedAt,
  }
}

export async function getRecipe(db: Db, id: string): Promise<Recipe> {
  const row = await db.query.recipes.findFirst({ where: and(eq(recipes.id, id), isNull(recipes.archivedAt)) })
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'レシピが見つかりません')
  const [items, steps] = await Promise.all([
    db
      .select({
        id: recipeIngredients.id,
        ingredientId: recipeIngredients.ingredientId,
        ingredientName: ingredients.name,
        unit: ingredients.unit,
        quantity: recipeIngredients.quantity,
        displayText: recipeIngredients.displayText,
        cutStyle: recipeIngredients.cutStyle,
        addOrder: recipeIngredients.addOrder,
      })
      .from(recipeIngredients)
      .innerJoin(ingredients, eq(ingredients.id, recipeIngredients.ingredientId))
      .where(eq(recipeIngredients.recipeId, id))
      .orderBy(asc(recipeIngredients.sortOrder)),
    db
      .select({ id: recipeSteps.id, stepNo: recipeSteps.stepNo, phase: recipeSteps.phase, text: recipeSteps.text })
      .from(recipeSteps)
      .where(eq(recipeSteps.recipeId, id))
      .orderBy(asc(recipeSteps.stepNo)),
  ])
  return toRecipe(row, items, steps)
}

export async function createRecipe(db: Db, input: RecipeInputParsed): Promise<Recipe> {
  const rows = await assertIngredientsExist(db, input)
  const id = ulid()
  await db.batch([
    db.insert(recipes).values({ id, ...recipeValues(input), ...resolveAttributes(input, rows) }),
    ...childInserts(db, id, input),
  ])
  return getRecipe(db, id)
}

/** 自分のお気に入りを付ける・外す。レシピの中身は変えない */
export async function setRecipeFavorite(db: Db, id: string, favorite: boolean): Promise<Recipe> {
  await getRecipe(db, id)
  await db.update(recipes).set({ isFavorite: favorite }).where(eq(recipes.id, id))
  return getRecipe(db, id)
}

/**
 * レシピを丸ごと更新する。材料と手順は全部入れ替える。作成元（sourceType）は変えない。
 * 公式レシピの情報（imageKey・件数など）は入力で省略されたら今の値を残す（drizzle は undefined を set しない）
 */
export async function updateRecipe(db: Db, id: string, input: RecipeInputParsed): Promise<Recipe> {
  await getRecipe(db, id)
  const existing = await db.query.recipes.findFirst({ where: eq(recipes.id, id) })
  const rows = await assertIngredientsExist(db, input, id)
  const { sourceType: _, ...values } = recipeValues(input)
  await db.batch([
    db
      .update(recipes)
      .set({ ...values, ...resolveAttributes(input, rows, existing) })
      .where(eq(recipes.id, id)),
    db.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, id)),
    db.delete(recipeSteps).where(eq(recipeSteps.recipeId, id)),
    ...childInserts(db, id, input),
  ])
  return getRecipe(db, id)
}

/** 論理削除（過去の献立や袋から参照されていても消せる。一覧から消えるだけ） */
export async function archiveRecipe(db: Db, id: string): Promise<void> {
  await getRecipe(db, id)
  await db.update(recipes).set({ archivedAt: new Date().toISOString() }).where(eq(recipes.id, id))
}
