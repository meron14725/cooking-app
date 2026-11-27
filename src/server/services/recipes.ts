import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import type {
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
  const { ingredients: _i, steps: _s, ...rest } = input
  return rest
}

/** 材料の食材がマスタにあるか確かめる（削除済みの食材は、すでにこのレシピで使っているものだけ許す） */
async function assertIngredientsExist(db: Db, input: RecipeInputParsed, recipeId?: string) {
  const ids = [...new Set(input.ingredients.map((i) => i.ingredientId))]
  const rows = await db
    .select({ id: ingredients.id, archivedAt: ingredients.archivedAt })
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
  if (sort === 'popular') return byCount(recipes.favoriteCount)
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

  const names = await db
    .select({ recipeId: recipeIngredients.recipeId, name: ingredients.name })
    .from(recipeIngredients)
    .innerJoin(ingredients, eq(ingredients.id, recipeIngredients.ingredientId))
    .where(
      inArray(
        recipeIngredients.recipeId,
        rows.map((r) => r.id),
      ),
    )
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
    cookCount: r.cookCount,
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
    cookCount: row.cookCount,
    score: row.score,
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
  await assertIngredientsExist(db, input)
  const id = ulid()
  await db.batch([db.insert(recipes).values({ id, ...recipeValues(input) }), ...childInserts(db, id, input)])
  return getRecipe(db, id)
}

/**
 * レシピを丸ごと更新する。材料と手順は全部入れ替える。作成元（sourceType）は変えない。
 * 公式レシピの情報（imageKey・件数など）は入力で省略されたら今の値を残す（drizzle は undefined を set しない）
 */
export async function updateRecipe(db: Db, id: string, input: RecipeInputParsed): Promise<Recipe> {
  await getRecipe(db, id)
  await assertIngredientsExist(db, input, id)
  const { sourceType: _, ...values } = recipeValues(input)
  await db.batch([
    db.update(recipes).set(values).where(eq(recipes.id, id)),
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
