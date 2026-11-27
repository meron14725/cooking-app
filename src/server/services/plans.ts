import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { DEFAULT_SERVINGS } from '../../shared/domain/constants'
import {
  type AvailableStock,
  evaluatePlan,
  type Proposal,
  type RecIngredient,
  type RecRecipe,
  recommend,
} from '../../shared/domain/recommend'
import type {
  Plan,
  PlanCreateInput,
  PlanRecipesInput,
  PlanStatus,
  ProposalView,
  RecommendationsResponse,
} from '../../shared/schemas/plan'
import type { Db } from '../db/client'
import { ingredients, packageUnits, planRecipes, plans, recipeIngredients, recipes } from '../db/schema'
import { ApiError } from '../errors'
import { listInventory } from './inventory'

const IN_PROGRESS: PlanStatus[] = ['draft', 'shopping', 'prepping']

// ---------- レコメンドの入力を DB から作る ----------

/** 食材マスタ（削除済みも含む。レシピから参照されていることがあるため）と販売単位（登録順） */
async function loadRecIngredients(db: Db): Promise<Map<string, RecIngredient>> {
  const [rows, units] = await Promise.all([
    db.select().from(ingredients),
    db.select().from(packageUnits).orderBy(asc(packageUnits.createdAt), asc(packageUnits.id)),
  ])
  return new Map(
    rows.map((r) => [
      r.id,
      {
        id: r.id,
        name: r.name,
        unit: r.unit,
        isStaple: r.isStaple,
        canFreeze: r.canFreeze,
        pantryDays: r.pantryDays,
        preppedFridgeDays: r.preppedFridgeDays,
        packageUnits: units
          .filter((u) => u.ingredientId === r.id)
          .map((u) => ({ id: u.id, label: u.label, quantity: u.quantity, isDefault: u.isDefault })),
      },
    ]),
  )
}

/** 登録レシピ（削除済みを除く）と材料 */
async function loadRecRecipes(db: Db): Promise<RecRecipe[]> {
  const [rows, parts] = await Promise.all([
    db.select().from(recipes).where(isNull(recipes.archivedAt)).orderBy(asc(recipes.title)),
    db
      .select({
        recipeId: recipeIngredients.recipeId,
        ingredientId: recipeIngredients.ingredientId,
        quantity: recipeIngredients.quantity,
      })
      .from(recipeIngredients)
      .orderBy(asc(recipeIngredients.sortOrder)),
  ])
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    servings: r.servings,
    caloriesKcal: r.caloriesKcal,
    maxServings1_6l: r.maxServings1_6l,
    ingredients: parts
      .filter((p) => p.recipeId === r.id)
      .map((p) => ({ ingredientId: p.ingredientId, quantity: p.quantity })),
  }))
}

/** 使える在庫 = 在庫 − 袋用の確保分（0 で止める） */
async function loadAvailable(db: Db, today: string): Promise<AvailableStock[]> {
  return (await listInventory(db, today)).flatMap((i) => {
    const quantity = Math.max(0, i.quantity - i.reservedQuantity)
    return quantity > 0
      ? [{ inventoryItemId: i.id, ingredientId: i.ingredientId, quantity, expiresOn: i.expiresOn }]
      : []
  })
}

// ---------- 献立 ----------

async function findPlanRow(db: Db, id: string) {
  const row = await db.query.plans.findFirst({ where: eq(plans.id, id) })
  if (!row) throw new ApiError(404, 'NOT_FOUND', '献立が見つかりません')
  return row
}

function assertDraft(status: PlanStatus) {
  if (status !== 'draft') throw new ApiError(409, 'INVALID_STATE', '確定済みの献立は変更できません')
}

export async function getPlan(db: Db, id: string): Promise<Plan> {
  const row = await findPlanRow(db, id)
  const items = await db
    .select({
      recipeId: planRecipes.recipeId,
      title: recipes.title,
      role: planRecipes.role,
      servings: planRecipes.servings,
      dayIndex: planRecipes.dayIndex,
      caloriesKcal: recipes.caloriesKcal,
      maxServings1_6l: recipes.maxServings1_6l,
    })
    .from(planRecipes)
    .innerJoin(recipes, eq(recipes.id, planRecipes.recipeId))
    .where(eq(planRecipes.planId, id))
    .orderBy(asc(planRecipes.dayIndex), asc(recipes.title))
  return { id: row.id, status: row.status, startsOn: row.startsOn, confirmedAt: row.confirmedAt, recipes: items }
}

/** 進行中（draft / shopping / prepping）の献立。なければ null */
export async function getCurrentPlan(db: Db): Promise<Plan | null> {
  const row = await db.query.plans.findFirst({ where: inArray(plans.status, IN_PROGRESS) })
  return row ? getPlan(db, row.id) : null
}

async function assertRecipesExist(db: Db, ids: string[]) {
  const rows = await db
    .select({ id: recipes.id })
    .from(recipes)
    .where(and(inArray(recipes.id, ids), isNull(recipes.archivedAt)))
  const found = new Set(rows.map((r) => r.id))
  const missing = ids.filter((id) => !found.has(id))
  if (missing.length > 0) throw new ApiError(400, 'UNKNOWN_RECIPE', 'レシピが見つかりません', { recipeIds: missing })
}

/** 献立を作る（draft）。進行中の献立があれば 409 */
export async function createPlan(db: Db, input: PlanCreateInput): Promise<Plan> {
  if (await getCurrentPlan(db)) {
    throw new ApiError(409, 'PLAN_IN_PROGRESS', '進行中の献立があります。先にそちらを終えるか破棄してください')
  }
  const ids = input.anchors.map((a) => a.recipeId)
  if (new Set(ids).size !== ids.length) throw new ApiError(400, 'VALIDATION_ERROR', '同じ料理が重なっています')
  await assertRecipesExist(db, ids)
  const [row] = await db.insert(plans).values({ status: 'draft' }).returning({ id: plans.id })
  if (!row) throw new Error('献立を作れませんでした')
  await db.batch([
    // 食べる順は仮の値（確定前に提案や画面で決め直す）
    db.insert(planRecipes).values(
      input.anchors.map((a, i) => ({
        planId: row.id,
        recipeId: a.recipeId,
        role: 'anchor' as const,
        servings: a.servings ?? DEFAULT_SERVINGS,
        dayIndex: i + 1,
      })),
    ),
  ])
  return getPlan(db, row.id)
}

/** 提案を計算して返す（保存しない） */
export async function recommendForPlan(
  db: Db,
  id: string,
  today: string,
  opts: { maxProposals?: number } = {},
): Promise<RecommendationsResponse> {
  const plan = await getPlan(db, id)
  assertDraft(plan.status)
  const [ingredientMap, catalog, available] = await Promise.all([
    loadRecIngredients(db),
    loadRecRecipes(db),
    loadAvailable(db, today),
  ])
  const byId = new Map(catalog.map((r) => [r.id, r]))
  const anchors = plan.recipes
    .filter((r) => r.role === 'anchor')
    .flatMap((r) => {
      const recipe = byId.get(r.recipeId)
      return recipe ? [{ recipe, servings: r.servings }] : []
    })
  if (anchors.length === 0) throw new ApiError(409, 'INVALID_STATE', '食べたい料理が選ばれていません')
  const result = recommend({
    anchors,
    catalog,
    available,
    ingredients: ingredientMap,
    today,
    options: { maxProposals: opts.maxProposals },
  })
  return {
    aiSuggestionRecommended: result.aiSuggestionRecommended,
    proposals: result.proposals.map((p) => toView(p, byId)),
  }
}

function toView(p: Proposal, byId: Map<string, RecRecipe>): ProposalView {
  return {
    ...p,
    recipes: p.recipes.map((r) => ({
      ...r,
      title: byId.get(r.recipeId)?.title ?? '',
      caloriesKcal: byId.get(r.recipeId)?.caloriesKcal ?? null,
    })),
  }
}

/** いまの献立（食べる順・食数そのまま）の買い物・余り・袋の場所。確定前の見直し用 */
export async function evaluatePlanById(db: Db, id: string, today: string): Promise<ProposalView> {
  const plan = await getPlan(db, id)
  assertDraft(plan.status)
  const [ingredientMap, catalog, available] = await Promise.all([
    loadRecIngredients(db),
    loadRecRecipes(db),
    loadAvailable(db, today),
  ])
  const byId = new Map(catalog.map((r) => [r.id, r]))
  const items = plan.recipes.flatMap((r) => {
    const recipe = byId.get(r.recipeId)
    return recipe ? [{ recipe, servings: r.servings, role: r.role, dayIndex: r.dayIndex }] : []
  })
  return toView(evaluatePlan({ items, available, ingredients: ingredientMap, today }), byId)
}

/** 確定前に献立のレシピを置き換える（提案を選んだとき、入れ替え・食べる順・食数を変えたとき） */
export async function replacePlanRecipes(db: Db, id: string, input: PlanRecipesInput): Promise<Plan> {
  const plan = await findPlanRow(db, id)
  assertDraft(plan.status)
  await assertRecipesExist(
    db,
    input.recipes.map((r) => r.recipeId),
  )
  await db.batch([
    db.delete(planRecipes).where(eq(planRecipes.planId, id)),
    db.insert(planRecipes).values(input.recipes.map((r) => ({ planId: id, ...r }))),
  ])
  return getPlan(db, id)
}

/** 確定: draft → shopping。1 日目の日付を決める（買い物リストの生成は計画 #9 で足す） */
export async function confirmPlan(db: Db, id: string, startsOn: string): Promise<Plan> {
  const plan = await getPlan(db, id)
  assertDraft(plan.status)
  if (plan.recipes.length === 0) throw new ApiError(409, 'INVALID_STATE', '料理が入っていません')
  await db
    .update(plans)
    .set({ status: 'shopping', startsOn, confirmedAt: new Date().toISOString() })
    .where(and(eq(plans.id, id), eq(plans.status, 'draft')))
  return getPlan(db, id)
}

/** 破棄できるのは、下ごしらえを始める前（draft / shopping）だけ */
export async function deletePlan(db: Db, id: string): Promise<void> {
  const plan = await findPlanRow(db, id)
  if (plan.status !== 'draft' && plan.status !== 'shopping') {
    throw new ApiError(409, 'INVALID_STATE', '下ごしらえを始めた献立は取り消せません')
  }
  await db.delete(plans).where(eq(plans.id, id))
}
