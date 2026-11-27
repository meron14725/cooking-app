/**
 * 「まとめて推定」（docs/design/09-recommendation-v2.md「区分・系統の推定」「食材マスタの手直し」）。
 * 段ごとに、ルールで決めてから、決まらなかったものだけを limit 件ずつ AI に聞く。
 * 1 回の呼び出しでは、AI に聞く必要が残っている最初の段だけ AI を使う（画面は remaining が 0 になるまで呼び続ける）。
 * 段の順: 食材の分類・重さ → レシピの区分・系統（区分の判定に食材の分類を使うため）
 */
import { and, asc, eq, isNull, or } from 'drizzle-orm'
import { fixIngredientByRule } from '../../shared/domain/ingredientAttributes'
import { deriveAttributes } from '../../shared/domain/recipeAttributes'
import type { EstimateAttributesResponse, StageProgress } from '../../shared/schemas/attributes'
import type { AiProvider } from '../ai/provider'
import type { Db } from '../db/client'
import { ingredients, recipeIngredients, recipes } from '../db/schema'

/** D1 の batch 1 回に入れる文の数 */
const BATCH_CHUNK = 50

async function runInChunks(db: Db, statements: Parameters<Db['batch']>[0][number][]) {
  for (let i = 0; i < statements.length; i += BATCH_CHUNK) {
    const chunk = statements.slice(i, i + BATCH_CHUNK)
    if (chunk.length > 0) await db.batch(chunk as unknown as Parameters<Db['batch']>[0])
  }
}

// ---------- 食材 ----------

/** attributes_source が NULL（取り込みのまま）の食材を直す */
async function ingredientStage(db: Db, ai: () => AiProvider, limit: number, useAi: boolean): Promise<StageProgress> {
  const rows = await db
    .select({
      id: ingredients.id,
      name: ingredients.name,
      category: ingredients.category,
      unit: ingredients.unit,
      gramsPerUnit: ingredients.gramsPerUnit,
    })
    .from(ingredients)
    .where(isNull(ingredients.attributesSource))
    .orderBy(asc(ingredients.name))

  const updates: Parameters<Db['batch']>[0][number][] = []
  const pending: { row: (typeof rows)[number]; categoryFromAi: boolean; needsGrams: boolean }[] = []
  for (const row of rows) {
    const fixed = fixIngredientByRule(row)
    if (!fixed.needsAi) {
      updates.push(
        db
          .update(ingredients)
          .set({ category: fixed.category, attributesSource: 'rule' })
          .where(eq(ingredients.id, row.id)),
      )
      continue
    }
    // 名前で分類が決まったものは、その分類を先に入れておく（AI には重さだけ聞く）
    if (fixed.category !== row.category) row.category = fixed.category
    pending.push({
      row,
      categoryFromAi: row.category === 'vegetable' && fixed.category === 'vegetable',
      needsGrams: row.unit !== 'g' && row.unit !== 'ml' && row.gramsPerUnit === null,
    })
  }
  await runInChunks(db, updates)
  if (!useAi || pending.length === 0) return { updated: updates.length, remaining: pending.length }

  const batch = pending.slice(0, limit)
  const result = await ai().classifyIngredients(
    batch.map((p) => ({ key: p.row.id, name: p.row.name, unit: p.row.unit, needsGrams: p.needsGrams })),
  )
  const byKey = new Map(result.items.map((i) => [i.key, i]))
  // AI が答えなかった食材も ai にする（同じ食材を何度も聞かないため）。分類は今の値のまま
  await runInChunks(
    db,
    batch.map((p) => {
      const answer = byKey.get(p.row.id)
      return db
        .update(ingredients)
        .set({
          category: p.categoryFromAi && answer ? answer.category : p.row.category,
          gramsPerUnit: p.needsGrams ? (answer?.gramsPerUnit ?? null) : p.row.gramsPerUnit,
          attributesSource: 'ai',
        })
        .where(eq(ingredients.id, p.row.id))
    }),
  )
  return { updated: updates.length + batch.length, remaining: pending.length - batch.length }
}

// ---------- レシピ ----------

/**
 * 手で直したもの（manual）と AI で決めたもの（ai）以外のレシピを、ルールで決め直す。
 * そのあと区分か系統が決まらなかったものを AI に聞く
 */
async function recipeStage(db: Db, ai: () => AiProvider, limit: number, useAi: boolean): Promise<StageProgress> {
  const target = and(
    isNull(recipes.archivedAt),
    or(isNull(recipes.attributesSource), eq(recipes.attributesSource, 'rule')),
  )
  const rows = await db
    .select({
      id: recipes.id,
      title: recipes.title,
      servings: recipes.servings,
      hotcookMode: recipes.hotcookMode,
      dishType: recipes.dishType,
      cuisine: recipes.cuisine,
      usesMixingUnit: recipes.usesMixingUnit,
      cookMinutes: recipes.cookMinutes,
      attributesSource: recipes.attributesSource,
    })
    .from(recipes)
    .where(target)
    .orderBy(asc(recipes.title))
  if (rows.length === 0) return { updated: 0, remaining: 0 }

  // ID を IN に並べると D1 の変数の上限（100）を超えるので、同じ条件で recipes と JOIN して取る
  const parts = await db
    .select({
      recipeId: recipeIngredients.recipeId,
      quantity: recipeIngredients.quantity,
      name: ingredients.name,
      category: ingredients.category,
      unit: ingredients.unit,
      gramsPerUnit: ingredients.gramsPerUnit,
      isStaple: ingredients.isStaple,
    })
    .from(recipeIngredients)
    .innerJoin(recipes, eq(recipes.id, recipeIngredients.recipeId))
    .innerJoin(ingredients, eq(ingredients.id, recipeIngredients.ingredientId))
    .where(target)
  const partsByRecipe = new Map<string, typeof parts>()
  for (const p of parts) {
    const list = partsByRecipe.get(p.recipeId) ?? []
    list.push(p)
    partsByRecipe.set(p.recipeId, list)
  }

  const updates: Parameters<Db['batch']>[0][number][] = []
  const pending: { id: string; title: string; ingredientNames: string[]; dishType: unknown; cuisine: unknown }[] = []
  for (const row of rows) {
    const list = partsByRecipe.get(row.id) ?? []
    // 取り込み元の値（まぜ技・調理時間）は残す。区分・系統はルールで決め直す
    const derived = deriveAttributes(
      { title: row.title, servings: row.servings, hotcookMode: row.hotcookMode, ingredients: list },
      { usesMixingUnit: row.usesMixingUnit, cookMinutes: row.cookMinutes },
    )
    const changed =
      row.attributesSource !== 'rule' ||
      derived.dishType !== row.dishType ||
      derived.cuisine !== row.cuisine ||
      derived.usesMixingUnit !== row.usesMixingUnit ||
      derived.cookMinutes !== row.cookMinutes
    if (changed) {
      updates.push(
        db
          .update(recipes)
          .set({ ...derived, attributesSource: 'rule' })
          .where(eq(recipes.id, row.id)),
      )
    }
    if (derived.dishType === null || derived.cuisine === null) {
      pending.push({
        id: row.id,
        title: row.title,
        ingredientNames: [...new Set(list.filter((p) => !p.isStaple).map((p) => p.name))],
        dishType: derived.dishType,
        cuisine: derived.cuisine,
      })
    }
  }
  await runInChunks(db, updates)
  if (!useAi || pending.length === 0) return { updated: updates.length, remaining: pending.length }

  const batch = pending.slice(0, limit)
  const result = await ai().classifyRecipes(
    batch.map((p) => ({ key: p.id, title: p.title, ingredientNames: p.ingredientNames })),
  )
  const byKey = new Map(result.items.map((i) => [i.key, i]))
  // ルールで決まった欄は残し、決まらなかった欄だけ AI の答えを入れる。答えがなくても ai にする（何度も聞かない）
  await runInChunks(
    db,
    batch.map((p) => {
      const answer = byKey.get(p.id)
      return db
        .update(recipes)
        .set({
          ...(p.dishType === null ? { dishType: answer?.dishType ?? null } : {}),
          ...(p.cuisine === null ? { cuisine: answer?.cuisine ?? null } : {}),
          attributesSource: 'ai',
        })
        .where(eq(recipes.id, p.id))
    }),
  )
  return { updated: updates.length + batch.length, remaining: pending.length - batch.length }
}

// ---------- まとめて ----------

/**
 * ai は AI を使うときだけ呼ぶ（ルールだけで済むときは AI の設定がなくても動く）
 */
export async function estimateAttributes(
  db: Db,
  ai: () => AiProvider,
  limit: number,
): Promise<EstimateAttributesResponse> {
  const ingredientProgress = await ingredientStage(db, ai, limit, true)
  // 食材の AI が残っているあいだは、レシピは数えるだけ（食材の分類が直ってから区分を決めるため）
  const recipeProgress = await recipeStage(db, ai, limit, ingredientProgress.remaining === 0)
  return { ingredients: ingredientProgress, recipes: recipeProgress }
}
