/**
 * レコメンド（docs/design/05-recommendation.md）。DB に依存しない純粋関数。
 * 食べたい料理（anchor）に、買ったパックを食べ切れる追加料理を組み合わせた案を出す。
 */
import type { Cuisine, DishType } from '../schemas/recipe'
import {
  CANDIDATES_BY_ADD_COUNT,
  DEFAULT_PREPPED_FRIDGE_DAYS,
  DEFAULT_SERVINGS,
  MAX_DISHES,
  MAX_EVALUATIONS,
  MAX_PROPOSALS,
  RECOMMEND_WEIGHTS,
  type RecommendWeights,
  SCORE_WEIGHTS,
  SERVINGS_STEP,
  TARGET_RECIPE_COUNT,
} from './constants'
import { expiryOf } from './expiry'
import { type RecipeFeatures, recipeFeatures, type ScoreBreakdown, scoreProposal } from './recommendScore'

// ---------- 入力 ----------

export type RecPackageUnit = { id: string; label: string; quantity: number; isDefault: boolean }

export type RecIngredient = {
  id: string
  name: string
  unit: string
  isStaple: boolean
  canFreeze: boolean
  pantryDays: number | null
  preppedFridgeDays: number | null
  /** 食材マスタの分類（vegetable など）。提案 v2 の野菜の量・主な食材に使う */
  category?: string
  /** 基準単位 1 つあたりの重さ（g） */
  gramsPerUnit?: number | null
  /** 代表量あたりの価格（円）。未設定は null（docs/design/10-cost.md） */
  priceYen?: number | null
  /** 登録順（最初に登録されたものが先頭） */
  packageUnits: RecPackageUnit[]
}

export type RecRecipe = {
  id: string
  title: string
  /** 材料の量が何人前か */
  servings: number
  caloriesKcal: number | null
  maxServings1_6l: number | null
  ingredients: { ingredientId: string; quantity: number | null }[]
  /** 削除済み（献立には残っているが、提案の候補にはしない） */
  archived?: boolean
  // 提案 v2 の点数に使う（docs/design/09-recommendation-v2.md）。なければ不明として扱う
  hotcookMode?: string | null
  dishType?: DishType | null
  cuisine?: Cuisine | null
  cookMinutes?: number | null
  favoriteCount?: number | null
  isFavorite?: boolean
  cookCount?: number | null
}

/** 使える在庫（袋用の確保分を引いた量）。行ごと */
export type AvailableStock = { inventoryItemId: string; ingredientId: string; quantity: number; expiresOn: string }

export type Role = 'anchor' | 'added'

export type RecommendInput = {
  anchors: { recipe: RecRecipe; servings: number }[]
  catalog: RecRecipe[]
  available: AvailableStock[]
  ingredients: Map<string, RecIngredient>
  today: string
  /**
   * もう出した案（「別の案を出す」）。案ごとのレシピ ID の並び。anchor を除いた追加料理の組み合わせで比べるので、
   * anchor を含めても含めなくてもよく、順番も問わない
   */
  exclude?: string[][]
  /**
   * 鍵で固定した料理と食数。必ず含め、残りの品数分だけ選び直す。
   * anchor を固定したときはその食数を使い、追加料理を固定したときは追加料理（added）のまま入れる
   */
  fixed?: { recipe: RecRecipe; servings: number }[]
  /**
   * 合計◯食の目標。あれば提案 v2（料理ごとの食数を配り、点数の項目を増やした探索）で選ぶ。
   * なければ品数（targetCount）と既定の食数で選ぶ（v2 の絞り込みと多様性が入ったら v2 だけにする）
   */
  targetMeals?: number
  /** 提案 v2 の重み（一部だけ上書きできる。調整のスクリプトとテスト用） */
  weights?: Partial<RecommendWeights>
  options?: {
    targetCount?: number
    maxProposals?: number
    defaultServings?: number
    /** 提案 v2 の食数の刻み（既定 SERVINGS_STEP） */
    servingsStep?: number
  }
}

// ---------- 出力 ----------

export type ShoppingLine = {
  ingredientId: string
  name: string
  /** 在庫で足りなかった量（基準単位） */
  needQuantity: number
  packageUnitId: string | null
  packageLabel: string | null
  packageCount: number
  buyQuantity: number
}

export type Leftover = {
  ingredientId: string
  name: string
  quantity: number
  unit: string
  perishable: boolean
  /** 代表量（ふだん買うパック）の何個分が余るか。多めに余るものを目立たせるのに使う */
  packs: number
}

export type InventoryUse = {
  inventoryItemId: string
  ingredientId: string
  name: string
  quantity: number
  expiresOn: string
  isExpiringSoon: boolean
}

export type Evaluation = {
  score: number
  shopping: ShoppingLine[]
  leftovers: Leftover[]
  usesInventory: InventoryUse[]
  /** 冷蔵のみの食材の余りで、いちばん多いもの（代表量の何パック分か） */
  maxPerishableLeftoverPacks: number
}

export type ProposalRecipe = { recipeId: string; role: Role; servings: number; dayIndex: number }

export type Proposal = Evaluation & {
  /** 提案 v2 のときだけ。項目ごとの点数（足すと score） */
  scoreBreakdown?: ScoreBreakdown
  recipes: ProposalRecipe[]
  kitLocations: { recipeId: string; location: 'fridge' | 'freezer' }[]
  totalCaloriesKcal: number | null
  warnings: string[]
}

export type RecommendResult = {
  proposals: Proposal[]
  aiSuggestionRecommended: boolean
  /** 今回の案と exclude のほかに、まだ出していない組み合わせが残っているか */
  hasMore: boolean
  /** 提案 v2 のときだけ。評価した組み合わせ × 食数の配り方の数（計算量の確認用） */
  evaluations?: number
}

// ---------- 小さな関数 ----------

const EPS = 1e-9
const round = (n: number) => Math.round(n * 1000) / 1000

/** 代表量: 代表の販売単位 → 最初の販売単位 → 基準単位 1 つ分（g なら 100g） */
export function representativeQuantity(ing: {
  unit: string
  packageUnits: Pick<RecPackageUnit, 'quantity' | 'isDefault'>[]
}): number {
  const def = ing.packageUnits.find((u) => u.isDefault) ?? ing.packageUnits[0]
  if (def && def.quantity > 0) return def.quantity
  return ing.unit === 'g' ? SCORE_WEIGHTS.gramsRepresentative : 1
}

/** 傷みやすさ: 常温で日持ち 0.1 / 冷凍できる 0.3 / 冷蔵のみ 1.0 */
export function perishability(ing: RecIngredient): number {
  const w = SCORE_WEIGHTS.perishability
  if ((ing.pantryDays ?? 0) >= SCORE_WEIGHTS.pantryStableDays) return w.pantry
  if (ing.canFreeze) return w.freezable
  return w.fridgeOnly
}

export type Purchase = { units: { unit: RecPackageUnit; count: number }[]; buyQuantity: number }

/**
 * 不足量を満たす買い方: 余りが最小、同じなら買う個数が最小。
 * 販売単位がなければ不足量ぴったり（量り売り扱い）。
 */
export function choosePurchase(need: number, units: RecPackageUnit[]): Purchase {
  const usable = units.filter((u) => u.quantity > 0)
  if (need <= EPS) return { units: [], buyQuantity: 0 }
  if (usable.length === 0) return { units: [], buyQuantity: need }

  let best: { counts: number[]; total: number; pieces: number } | null = null
  const counts = new Array<number>(usable.length).fill(0)
  const search = (index: number, total: number, pieces: number) => {
    if (total >= need - EPS) {
      const better = !best || total < best.total - EPS || (Math.abs(total - best.total) <= EPS && pieces < best.pieces)
      if (better) best = { counts: [...counts], total, pieces }
      return
    }
    if (index >= usable.length) return
    const unit = usable[index] as RecPackageUnit
    const max = Math.ceil((need - total) / unit.quantity - EPS)
    for (let c = 0; c <= max; c++) {
      counts[index] = c
      search(index + 1, total + c * unit.quantity, pieces + c)
    }
    counts[index] = 0
  }
  search(0, 0, 0)
  const found = best as { counts: number[]; total: number } | null
  if (!found) return { units: [], buyQuantity: need }
  return {
    units: usable.flatMap((unit, i) => ((found.counts[i] ?? 0) > 0 ? [{ unit, count: found.counts[i] ?? 0 }] : [])),
    buyQuantity: round(found.total),
  }
}

// ---------- 1 つの組み合わせの評価 ----------

type Ctx = Pick<RecommendInput, 'available' | 'ingredients' | 'today'>

/** 料理と食数の集合から、買い物・余り・在庫の使い方とスコアを出す */
export function evaluate(items: { recipe: RecRecipe; servings: number }[], ctx: Ctx): Evaluation {
  // 1. 必要量を集計（少々と常備品は外す）
  const need = new Map<string, number>()
  for (const { recipe, servings } of items) {
    const factor = servings / recipe.servings
    for (const ri of recipe.ingredients) {
      const ing = ctx.ingredients.get(ri.ingredientId)
      if (!ing || ing.isStaple || ri.quantity === null) continue
      need.set(ing.id, (need.get(ing.id) ?? 0) + ri.quantity * factor)
    }
  }

  // 2. 使える在庫を期限の近い順に割り当てる
  const stockByIngredient = new Map<string, AvailableStock[]>()
  for (const s of ctx.available) {
    if (s.quantity <= EPS) continue
    const list = stockByIngredient.get(s.ingredientId) ?? []
    list.push(s)
    stockByIngredient.set(s.ingredientId, list)
  }
  for (const list of stockByIngredient.values()) {
    list.sort((a, b) => a.expiresOn.localeCompare(b.expiresOn) || a.inventoryItemId.localeCompare(b.inventoryItemId))
  }

  let score = 0
  const shopping: ShoppingLine[] = []
  const leftovers: Leftover[] = []
  const usesInventory: InventoryUse[] = []
  const usedByRow = new Map<string, number>()
  let maxPerishableLeftoverPacks = 0

  for (const [ingredientId, total] of need) {
    const ing = ctx.ingredients.get(ingredientId) as RecIngredient
    const rep = representativeQuantity(ing)
    let remaining = total
    for (const stock of stockByIngredient.get(ingredientId) ?? []) {
      if (remaining <= EPS) break
      const take = Math.min(stock.quantity, remaining)
      remaining -= take
      usedByRow.set(stock.inventoryItemId, take)
      const { isExpiringSoon } = expiryOf(stock.expiresOn, ctx.today)
      usesInventory.push({
        inventoryItemId: stock.inventoryItemId,
        ingredientId,
        name: ing.name,
        quantity: round(take),
        expiresOn: stock.expiresOn,
        isExpiringSoon,
      })
      score -=
        (take / rep) * SCORE_WEIGHTS.inventoryBonus * (isExpiringSoon ? SCORE_WEIGHTS.expiringBonusMultiplier : 1)
    }

    // 3. 足りない分を販売単位で切り上げる
    if (remaining > EPS) {
      const shortfall = round(remaining)
      const purchase = choosePurchase(shortfall, ing.packageUnits)
      if (purchase.units.length === 0) {
        shopping.push({
          ingredientId,
          name: ing.name,
          needQuantity: shortfall,
          packageUnitId: null,
          packageLabel: null,
          packageCount: 1,
          buyQuantity: shortfall,
        })
      } else {
        purchase.units.forEach(({ unit, count }, i) => {
          shopping.push({
            ingredientId,
            name: ing.name,
            // 不足量は食材の最初の行にだけ載せる（1 食材で複数の販売単位を買うとき）
            needQuantity: i === 0 ? shortfall : 0,
            packageUnitId: unit.id,
            packageLabel: unit.label,
            packageCount: count,
            buyQuantity: round(unit.quantity * count),
          })
        })
      }
      // 4. 新しく生まれる余り
      const leftover = round(purchase.buyQuantity - shortfall)
      if (leftover > EPS) {
        const weight = perishability(ing)
        const perishable = weight >= SCORE_WEIGHTS.perishability.fridgeOnly
        leftovers.push({
          ingredientId,
          name: ing.name,
          quantity: leftover,
          unit: ing.unit,
          perishable,
          packs: round(leftover / rep),
        })
        score += (leftover / rep) * weight
        if (perishable) maxPerishableLeftoverPacks = Math.max(maxPerishableLeftoverPacks, leftover / rep)
      }
    }
  }

  // 期限間近の在庫を使い残したペナルティ
  for (const stock of ctx.available) {
    if (!expiryOf(stock.expiresOn, ctx.today).isExpiringSoon) continue
    const ing = ctx.ingredients.get(stock.ingredientId)
    if (!ing || ing.isStaple) continue
    const unused = stock.quantity - (usedByRow.get(stock.inventoryItemId) ?? 0)
    if (unused > EPS) score += (unused / representativeQuantity(ing)) * SCORE_WEIGHTS.expiringUnusedPenalty
  }

  const shoppingPoints = new Set(shopping.map((s) => s.ingredientId)).size
  score += shoppingPoints * SCORE_WEIGHTS.perShoppingItem

  return {
    score: round(score),
    shopping,
    leftovers,
    usesInventory,
    maxPerishableLeftoverPacks: round(maxPerishableLeftoverPacks),
  }
}

// ---------- 食べる順と袋の保存場所 ----------

/** 料理の材料のうち「切った後の冷蔵日持ち」の最小値と、冷凍できない食材の数 */
function freshness(recipe: RecRecipe, ingredients: Map<string, RecIngredient>) {
  let minPreppedFridge = Number.POSITIVE_INFINITY
  let nonFreezable = 0
  for (const ri of recipe.ingredients) {
    const ing = ingredients.get(ri.ingredientId)
    if (!ing || ing.isStaple) continue
    minPreppedFridge = Math.min(minPreppedFridge, ing.preppedFridgeDays ?? DEFAULT_PREPPED_FRIDGE_DAYS)
    if (!ing.canFreeze) nonFreezable++
  }
  return {
    minPreppedFridge: Number.isFinite(minPreppedFridge) ? minPreppedFridge : DEFAULT_PREPPED_FRIDGE_DAYS,
    nonFreezable,
  }
}

/**
 * 食べる順の初期値（1 日目から）: 切った後に日持ちしない料理、冷凍できない食材が多い料理を先に。
 * 同点なら anchor を先、その次は料理名順
 */
export function orderDays(
  items: { recipe: RecRecipe; role: Role }[],
  ingredients: Map<string, RecIngredient>,
): Map<string, number> {
  const sorted = items
    .map((item) => ({ ...item, ...freshness(item.recipe, ingredients) }))
    .sort(
      (a, b) =>
        a.minPreppedFridge - b.minPreppedFridge ||
        b.nonFreezable - a.nonFreezable ||
        (a.role === b.role ? 0 : a.role === 'anchor' ? -1 : 1) ||
        a.recipe.title.localeCompare(b.recipe.title, 'ja'),
    )
  return new Map(sorted.map((item, i) => [item.recipe.id, i + 1]))
}

/**
 * 袋の保存場所: 食べる日 − 袋詰めの日（= dayIndex − 1）が、切った後の冷蔵日持ち以内なら冷蔵、それより先なら冷凍
 * （docs/design/02-data-model.md「袋の保存場所と期限」）
 */
export function kitLocation(
  recipe: RecRecipe,
  dayIndex: number,
  ingredients: Map<string, RecIngredient>,
): 'fridge' | 'freezer' {
  return dayIndex - 1 <= freshness(recipe, ingredients).minPreppedFridge ? 'fridge' : 'freezer'
}

// ---------- 探索 ----------

function* combinations<T>(list: T[], k: number, start = 0, picked: T[] = []): Generator<T[]> {
  if (picked.length === k) {
    yield picked
    return
  }
  for (let i = start; i <= list.length - (k - picked.length); i++) {
    yield* combinations(list, k, i + 1, [...picked, list[i] as T])
  }
}

function fitsPot(recipe: RecRecipe, servings: number): boolean {
  return recipe.maxServings1_6l === null || servings <= recipe.maxServings1_6l + EPS
}

function buildProposal(
  items: { recipe: RecRecipe; servings: number; role: Role }[],
  evaluation: Evaluation,
  ingredients: Map<string, RecIngredient>,
  fixedDays?: Map<string, number>,
): Proposal {
  const days = fixedDays ?? orderDays(items, ingredients)
  const recipes = items
    .map((i) => ({ recipeId: i.recipe.id, role: i.role, servings: i.servings, dayIndex: days.get(i.recipe.id) ?? 1 }))
    .sort((a, b) => a.dayIndex - b.dayIndex)
  const byId = new Map(items.map((i) => [i.recipe.id, i.recipe]))
  const warnings: string[] = []
  for (const i of items) {
    if (i.recipe.maxServings1_6l === null) warnings.push(`${i.recipe.title}: 1.6L に収まるか未確認`)
    else if (!fitsPot(i.recipe, i.servings)) {
      warnings.push(
        `${i.recipe.title}: ${i.servings}食分は 1.6L に収まらないかもしれません（最大 ${i.recipe.maxServings1_6l}）`,
      )
    }
  }
  const calories = items.map((i) => (i.recipe.caloriesKcal === null ? null : i.recipe.caloriesKcal * i.servings))
  return {
    ...evaluation,
    recipes,
    kitLocations: recipes.map((r) => ({
      recipeId: r.recipeId,
      location: kitLocation(byId.get(r.recipeId) as RecRecipe, r.dayIndex, ingredients),
    })),
    totalCaloriesKcal: calories.some((c) => c === null)
      ? null
      : Math.round(calories.reduce<number>((a, c) => a + (c ?? 0), 0)),
    warnings,
  }
}

/** 食べる順と食数が決まった献立を評価する（提案を選んだ後に入れ替え・並べ替えたとき） */
export function evaluatePlan(input: {
  items: { recipe: RecRecipe; servings: number; role: Role; dayIndex: number }[]
  available: AvailableStock[]
  ingredients: Map<string, RecIngredient>
  today: string
}): Proposal {
  const ctx: Ctx = { available: input.available, ingredients: input.ingredients, today: input.today }
  const days = new Map(input.items.map((i) => [i.recipe.id, i.dayIndex]))
  return buildProposal(input.items, evaluate(input.items, ctx), input.ingredients, days)
}

/** 選び直した追加料理の組み合わせを比べるためのキー（anchor と固定した料理を除き、順番によらない） */
function comboKey(recipeIds: string[], baseIds: Set<string>): string {
  return recipeIds
    .filter((id) => !baseIds.has(id))
    .sort()
    .join('\n')
}

export function recommend(input: RecommendInput): RecommendResult {
  if (input.targetMeals !== undefined) return recommendByMeals(input, input.targetMeals)
  const targetCount = input.options?.targetCount ?? TARGET_RECIPE_COUNT
  const maxProposals = input.options?.maxProposals ?? MAX_PROPOSALS
  const defaultServings = input.options?.defaultServings ?? DEFAULT_SERVINGS
  const ctx: Ctx = { available: input.available, ingredients: input.ingredients, today: input.today }
  // 必ず入る料理: anchor（固定していればその食数）と、固定した追加料理
  const fixedServings = new Map((input.fixed ?? []).map((f) => [f.recipe.id, f.servings]))
  const anchors = input.anchors.map((a) => ({
    ...a,
    servings: fixedServings.get(a.recipe.id) ?? a.servings,
    role: 'anchor' as const,
  }))
  const anchorIds = new Set(anchors.map((a) => a.recipe.id))
  const fixedAdded = (input.fixed ?? [])
    .filter((f) => !anchorIds.has(f.recipe.id))
    .map((f) => ({ ...f, role: 'added' as const }))
  const base = [...anchors, ...fixedAdded]
  const baseIds = new Set(base.map((b) => b.recipe.id))
  const addCount = targetCount - base.length
  const excluded = new Set((input.exclude ?? []).map((ids) => comboKey(ids, baseIds)))

  // 必ず入る料理だけの 1 案（目標の品数に届いている、または足せる候補がない）
  const anchorsOnly = (aiSuggestionRecommended: boolean): RecommendResult => {
    const proposals = excluded.has('') ? [] : [buildProposal(base, evaluate(base, ctx), input.ingredients)]
    return { proposals, aiSuggestionRecommended, hasMore: false }
  }

  // 必ず入る料理だけで目標の品数に届いていれば探索しない
  if (addCount <= 0) return anchorsOnly(false)

  const candidates = input.catalog.filter((r) => !baseIds.has(r.id) && fitsPot(r, defaultServings))
  if (candidates.length === 0) return anchorsOnly(true)

  const k = Math.min(addCount, candidates.length)
  const scored: { added: RecRecipe[]; evaluation: Evaluation }[] = []
  for (const added of combinations(candidates, k)) {
    const items = [...base, ...added.map((recipe) => ({ recipe, servings: defaultServings }))]
    scored.push({ added, evaluation: evaluate(items, ctx) })
  }
  scored.sort(
    (a, b) =>
      a.evaluation.score - b.evaluation.score ||
      a.added
        .map((r) => r.id)
        .join()
        .localeCompare(b.added.map((r) => r.id).join()),
  )
  // AI 補完をすすめるかは、出した案によらずいちばん良い組み合わせで決める（「別の案を出す」で変わらない）
  const overallBest = scored[0]
  const aiSuggestionRecommended =
    !overallBest || overallBest.evaluation.maxPerishableLeftoverPacks >= SCORE_WEIGHTS.aiSuggestionLeftoverPacks - EPS
  const isNew = (s: (typeof scored)[number]) =>
    !excluded.has(
      comboKey(
        s.added.map((r) => r.id),
        baseIds,
      ),
    )
  const remaining = scored.filter(isNew)

  // 似た案（追加料理が 1 品でも同じ）を避けて上位を選び、足りなければ飛ばした案で埋める
  const picked: typeof scored = []
  const skipped: typeof scored = []
  const usedAdded = new Set<string>()
  for (const s of remaining) {
    if (picked.length >= maxProposals) break
    if (s.added.some((r) => usedAdded.has(r.id))) {
      skipped.push(s)
      continue
    }
    picked.push(s)
    for (const r of s.added) usedAdded.add(r.id)
  }
  for (const s of skipped) {
    if (picked.length >= maxProposals) break
    picked.push(s)
  }
  picked.sort((a, b) => a.evaluation.score - b.evaluation.score)

  const proposals = picked.map((s) =>
    buildProposal(
      [...base, ...s.added.map((recipe) => ({ recipe, servings: defaultServings, role: 'added' as const }))],
      s.evaluation,
      input.ingredients,
    ),
  )
  return { proposals, aiSuggestionRecommended, hasMore: remaining.length > picked.length }
}

// ---------- 提案 v2: 合計◯食に食数を配る（docs/design/09-recommendation-v2.md） ----------

/** 1 品に配れる食数: 刻みの倍数で、1 回で作れる量まで。刻みより小さい量しか作れなければその量だけ */
export function allowedServings(f: RecipeFeatures, step: number): number[] {
  const values: number[] = []
  for (let s = step; s <= f.potCap + EPS; s += step) values.push(s)
  return values.length > 0 ? values : f.potCap > 0 ? [f.potCap] : []
}

/** 料理ごとの食数の候補から、合計が total になる配り方を全部出す */
export function* allocations(options: number[][], total: number): Generator<number[]> {
  const mins = options.map((o) => Math.min(...o))
  const maxs = options.map((o) => Math.max(...o))
  const suffixMin = mins.map((_, i) => mins.slice(i).reduce((a, b) => a + b, 0))
  const suffixMax = maxs.map((_, i) => maxs.slice(i).reduce((a, b) => a + b, 0))
  const picked: number[] = []
  function* walk(i: number, rest: number): Generator<number[]> {
    if (i === options.length) {
      if (Math.abs(rest) <= EPS) yield [...picked]
      return
    }
    if (rest < (suffixMin[i] ?? 0) - EPS || rest > (suffixMax[i] ?? 0) + EPS) return
    for (const v of options[i] ?? []) {
      picked.push(v)
      yield* walk(i + 1, rest - v)
      picked.pop()
    }
  }
  if (options.length === 0) {
    if (Math.abs(total) <= EPS) yield []
    return
  }
  yield* walk(0, total)
}

type MealItem = { recipe: RecRecipe; servings: number; role: Role; wanted: number | null }
type MealScored = {
  items: MealItem[]
  added: RecRecipe[]
  evaluation: Evaluation
  score: number
  breakdown: ScoreBreakdown
}

function recommendByMeals(input: RecommendInput, targetMeals: number): RecommendResult {
  const maxProposals = input.options?.maxProposals ?? MAX_PROPOSALS
  const step = input.options?.servingsStep ?? SERVINGS_STEP
  const weights: RecommendWeights = { ...RECOMMEND_WEIGHTS, ...input.weights }
  const ctx: Ctx = { available: input.available, ingredients: input.ingredients, today: input.today }

  const fixedServings = new Map((input.fixed ?? []).map((f) => [f.recipe.id, f.servings]))
  const anchorIds = new Set(input.anchors.map((a) => a.recipe.id))
  const fixedAdded = (input.fixed ?? []).filter((f) => !anchorIds.has(f.recipe.id))
  const baseIds = new Set([...anchorIds, ...fixedAdded.map((f) => f.recipe.id)])
  const excluded = new Set((input.exclude ?? []).map((ids) => comboKey(ids, baseIds)))

  const all = new Map<string, RecRecipe>()
  for (const r of [...input.catalog, ...input.anchors.map((a) => a.recipe), ...fixedAdded.map((f) => f.recipe)]) {
    all.set(r.id, r)
  }
  const features = recipeFeatures([...all.values()], input.ingredients)
  const featureOf = (r: RecRecipe) => features.get(r.id) as RecipeFeatures

  // 食数が決まっている料理（固定した anchor と追加料理）と、配り直す anchor
  const fixedItems: MealItem[] = [
    ...input.anchors
      .filter((a) => fixedServings.has(a.recipe.id))
      .map((a) => ({
        recipe: a.recipe,
        servings: fixedServings.get(a.recipe.id) as number,
        role: 'anchor' as const,
        wanted: null,
      })),
    ...fixedAdded.map((f) => ({ recipe: f.recipe, servings: f.servings, role: 'added' as const, wanted: null })),
  ]
  const freeAnchors = input.anchors.filter((a) => !fixedServings.has(a.recipe.id))
  const restMeals = targetMeals - fixedItems.reduce((a, i) => a + i.servings, 0)

  let evaluations = 0
  const score = (items: MealItem[], added: RecRecipe[]): MealScored => {
    const evaluation = evaluate(items, ctx)
    const { score: total, breakdown } = scoreProposal(
      items.map((i) => ({ recipeId: i.recipe.id, servings: i.servings, role: i.role, wantedServings: i.wanted })),
      evaluation.score,
      features,
      weights,
    )
    return { items, added, evaluation, score: total, breakdown }
  }

  // 選んだときの食数のままの anchor（目標に配れないときの 1 案、単品の点数の土台）
  const wantedAnchors: MealItem[] = freeAnchors.map((a) => ({
    recipe: a.recipe,
    servings: a.servings,
    role: 'anchor' as const,
    wanted: a.servings,
  }))
  const asProposal = (s: MealScored): Proposal => ({
    ...buildProposal(s.items, s.evaluation, input.ingredients),
    score: s.score,
    scoreBreakdown: s.breakdown,
  })
  const baseOnly = (aiSuggestionRecommended: boolean): RecommendResult => {
    const s = score([...fixedItems, ...wantedAnchors], [])
    return {
      proposals: excluded.has('') ? [] : [asProposal(s)],
      aiSuggestionRecommended,
      hasMore: false,
      evaluations: 1,
    }
  }

  // 刻みより少ししか作れない料理（1.6L で 1 食分など）は、追加の候補にしない（合計がぴったりにならないため）
  const candidates = input.catalog.filter((r) => !baseIds.has(r.id) && !r.archived && featureOf(r).potCap >= step)
  // 単品の点数: anchor（選んだときの食数）＋その料理（最小の食数）で、候補を良い順に並べる
  const singles = candidates
    .map((c) => {
      const min = allowedServings(featureOf(c), step)[0] as number
      const item: MealItem = { recipe: c, servings: min, role: 'added', wanted: null }
      return { recipe: c, score: score([...fixedItems, ...wantedAnchors, item], [c]).score }
    })
    .sort((a, b) => a.score - b.score || a.recipe.id.localeCompare(b.recipe.id))

  const maxAdd = Math.min(3, MAX_DISHES - fixedItems.length - freeAnchors.length)
  const results: MealScored[] = []
  const anchorOptions = freeAnchors.map((a) => allowedServings(featureOf(a.recipe), step))
  // anchor や固定に刻みより少ししか作れない料理があると、合計が目標ぴったりにならないことがある。
  // そのときは目標以下でいちばん近い合計を探す
  for (let goal = restMeals; goal > restMeals - step && results.length === 0 && goal > 0; goal--) {
    searchMeals(goal)
  }

  function searchMeals(goal: number) {
    outer: for (let addCount = 0; addCount <= Math.max(0, maxAdd); addCount++) {
      const pool = addCount === 0 ? [] : singles.slice(0, CANDIDATES_BY_ADD_COUNT[addCount] ?? 0).map((s) => s.recipe)
      if (addCount > 0 && pool.length < addCount) break
      for (const added of addCount === 0 ? [[] as RecRecipe[]] : combinations(pool, addCount)) {
        const options = [...anchorOptions, ...added.map((r) => allowedServings(featureOf(r), step))]
        for (const alloc of allocations(options, goal)) {
          if (evaluations >= MAX_EVALUATIONS) break outer
          evaluations++
          const items: MealItem[] = [
            ...fixedItems,
            ...freeAnchors.map((a, i) => ({
              recipe: a.recipe,
              servings: alloc[i] as number,
              role: 'anchor' as const,
              wanted: a.servings,
            })),
            ...added.map((recipe, i) => ({
              recipe,
              servings: alloc[freeAnchors.length + i] as number,
              role: 'added' as const,
              wanted: null,
            })),
          ]
          results.push(score(items, added))
        }
      }
    }
  }

  // 目標の食数に配れない（anchor だけで超える、作れる量が足りないなど）ときは、選んだときの食数のまま 1 案
  if (results.length === 0) return baseOnly(candidates.length === 0)

  const key = (s: MealScored) =>
    s.added
      .map((r) => r.id)
      .sort()
      .join('\n')
  results.sort((a, b) => a.score - b.score || key(a).localeCompare(key(b)))
  const best = results[0]
  const aiSuggestionRecommended =
    candidates.length === 0 ||
    (best?.evaluation.maxPerishableLeftoverPacks ?? 0) >= SCORE_WEIGHTS.aiSuggestionLeftoverPacks - EPS

  // 出した組み合わせ（追加料理の集合）を除く。同じ集合の食数違いもまとめて除く（食数込みの比べ方は次の PR）
  const remaining = results.filter((s) => !excluded.has(key(s)))
  // 似た案（追加料理が 1 品でも同じで、食数の配り方も同じ）を避けて上位を選び、足りなければ飛ばした案で埋める。
  // 配り方が違えば（カレー 4 ＋副菜 2 と、カレー 2 ＋ 2 品を 2 食ずつ）料理が重なっても別の案として出す
  const picked: MealScored[] = []
  const skipped: MealScored[] = []
  const used = new Map<string, Set<string>>()
  const pickedKeys = new Set<string>()
  const shapeOf = (s: MealScored) =>
    s.items
      .map((i) => i.servings)
      .sort((a, b) => b - a)
      .join(',')
  for (const s of remaining) {
    if (picked.length >= maxProposals) break
    const ids = s.added.length === 0 ? [''] : s.added.map((r) => r.id)
    const shape = shapeOf(s)
    if (ids.some((id) => used.get(id)?.has(shape))) {
      skipped.push(s)
      continue
    }
    picked.push(s)
    pickedKeys.add(key(s))
    for (const id of ids) used.set(id, new Set([...(used.get(id) ?? []), shape]))
  }
  for (const s of skipped) {
    if (picked.length >= maxProposals) break
    picked.push(s)
    pickedKeys.add(key(s))
  }
  picked.sort((a, b) => a.score - b.score)
  const remainingKeys = new Set(remaining.map(key))
  return {
    proposals: picked.map(asProposal),
    aiSuggestionRecommended,
    hasMore: remainingKeys.size > pickedKeys.size,
    evaluations,
  }
}
