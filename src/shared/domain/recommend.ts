/**
 * レコメンド（docs/design/05-recommendation.md、09-recommendation-v2.md）。DB に依存しない純粋関数。
 * 食べたい料理（anchor）に、買ったパックを食べ切れる追加料理を組み合わせ、合計◯食に食数を配った案を出す。
 */
import type { Cuisine, DishType } from '../schemas/recipe'
import {
  CANDIDATE_POOL,
  CANDIDATES_BY_ADD_COUNT,
  DEFAULT_PREPPED_FRIDGE_DAYS,
  DEFAULT_TARGET_MEALS,
  DIVERSITY_CANDIDATES,
  DIVERSITY_LAMBDA,
  DIVERSITY_RECENT_EXCLUDES,
  EXPIRING_SOON_DAYS,
  FALLBACK_PRICE_PER_PACK_YEN,
  MAX_DISHES,
  MAX_EVALUATIONS,
  MAX_EVALUATIONS_PER_CALL,
  MAX_EXTRA_ROUNDS,
  MAX_PROPOSALS,
  PACK_YEN,
  RECOMMEND_WEIGHTS,
  type RecommendWeights,
  SCORE_WEIGHTS,
  SERVINGS_STEP,
  SIMILARITY_WEIGHTS,
} from './constants'
import { addDays } from './date'
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
  /** 削除済みの食材（レシピから参照されていることがあるので渡す）。点数の仮の単価の中央値には入れない */
  archived?: boolean
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
  usesMixingUnit?: boolean | null
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
   * もう出した案（「別の案を出す」）。食数付き（{ recipeId, servings }[]）なら同じ料理と食数の案を除き、
   * レシピ ID だけ（古い形）なら anchor と固定を除いた料理の組み合わせで除く。順番は問わない
   */
  exclude?: ExcludedProposal[]
  /**
   * 鍵で固定した料理と食数。必ず含め、残りの品数分だけ選び直す。
   * anchor を固定したときはその食数を使い、追加料理を固定したときは追加料理（added）のまま入れる
   */
  fixed?: { recipe: RecRecipe; servings: number }[]
  /** 合計◯食の目標（既定 DEFAULT_TARGET_MEALS）。料理ごとに食数を配る */
  targetMeals?: number
  /** 提案 v2 の重み（一部だけ上書きできる。調整のスクリプトとテスト用） */
  weights?: Partial<RecommendWeights>
  options?: {
    maxProposals?: number
    /** 食数の刻み（既定 SERVINGS_STEP） */
    servingsStep?: number
    /** 多様性の強さ（既定 DIVERSITY_LAMBDA。0 で点数順そのまま） */
    diversityLambda?: number
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

/**
 * 点数で使う「代表量（パック）何個分」。価格があれば金額を PACK_YEN でパックの数にそろえる
 * （安い食材の余りは軽く、高い食材の余りは重く。docs/design/10-cost.md）。なければ量 ÷ 代表量
 */
export function scorePacks(ing: RecIngredient, quantity: number): number {
  const rep = representativeQuantity(ing)
  if (ing.priceYen === null || ing.priceYen === undefined || ing.priceYen <= 0) return quantity / rep
  return (quantity * ing.priceYen) / rep / PACK_YEN
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2
}

/**
 * 点数で使う単価（基準単位あたりの円）。価格があればその単価。未設定なら、同じ分類・同じ基準単位の食材の単価の中央値、
 * それもなければ FALLBACK_PRICE_PER_PACK_YEN を代表量の価格とみなす（未設定の食材を使う案が安く見えないように）。
 * 中央値には削除済みの食材の価格は入れない（もう買わない食材の古い価格で、今の相場がずれないように）。
 * 画面に出す金額には使わない
 */
export function scoreUnitPrices(ingredients: Map<string, RecIngredient>): Map<string, number> {
  const groups = new Map<string, number[]>()
  const groupKey = (ing: RecIngredient) => `${ing.category ?? ''}\u0000${ing.unit}`
  for (const ing of ingredients.values()) {
    if (ing.isStaple || ing.archived || ing.priceYen === null || ing.priceYen === undefined || ing.priceYen <= 0) {
      continue
    }
    const list = groups.get(groupKey(ing)) ?? []
    list.push(ing.priceYen / representativeQuantity(ing))
    groups.set(groupKey(ing), list)
  }
  const medians = new Map([...groups].map(([k, v]) => [k, median(v)]))
  const result = new Map<string, number>()
  for (const ing of ingredients.values()) {
    if (ing.isStaple) continue
    const own = ing.priceYen !== null && ing.priceYen !== undefined && ing.priceYen > 0
    result.set(
      ing.id,
      own
        ? (ing.priceYen as number) / representativeQuantity(ing)
        : (medians.get(groupKey(ing)) ?? FALLBACK_PRICE_PER_PACK_YEN / representativeQuantity(ing)),
    )
  }
  return result
}

/** 点数で使う買う金額（scoreUnitPrices の単価で数える） */
export function scoreBuyYen(
  shopping: Pick<ShoppingLine, 'ingredientId' | 'buyQuantity'>[],
  unitPrices: Map<string, number>,
) {
  return shopping.reduce((a, s) => a + s.buyQuantity * (unitPrices.get(s.ingredientId) ?? 0), 0)
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
        scorePacks(ing, take) *
        SCORE_WEIGHTS.inventoryBonus *
        (isExpiringSoon ? SCORE_WEIGHTS.expiringBonusMultiplier : 1)
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
        score += scorePacks(ing, leftover) * weight
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
    if (unused > EPS) score += scorePacks(ing, unused) * SCORE_WEIGHTS.expiringUnusedPenalty
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

/** 似ている度合いを比べるための、案の特徴（anchor と固定を除いた追加料理と、食数の配り方） */
type Profile = {
  ids: Set<string>
  mains: Set<string>
  heat: Set<string>
  mainCuisine: string | null
  mixing: number
  /** 食数を大きい順に並べた形。古い形の exclude では分からないので null */
  shape: string | null
}

const jaccard = (a: Set<string>, b: Set<string>) => {
  if (a.size === 0 && b.size === 0) return 0
  let common = 0
  for (const x of a) if (b.has(x)) common++
  return common / (a.size + b.size - common)
}

/** 似ている度合い（0〜1）。追加した料理がない案どうしは食数の配り方だけで比べる */
export function similarity(a: Profile, b: Profile, w: typeof SIMILARITY_WEIGHTS = SIMILARITY_WEIGHTS): number {
  const sameShape = a.shape !== null && a.shape === b.shape ? 1 : 0
  if (a.ids.size === 0 && b.ids.size === 0) return sameShape
  return (
    w.recipes * jaccard(a.ids, b.ids) +
    w.mainIngredient * jaccard(a.mains, b.mains) +
    w.mainCuisine * (a.mainCuisine !== null && a.mainCuisine === b.mainCuisine ? 1 : 0) +
    w.heatMode * jaccard(a.heat, b.heat) +
    w.mixing * (a.mixing === b.mixing ? 1 : 0) +
    w.shape * sameShape
  )
}

/** もう出した案（「別の案を出す」）。食数付きの新しい形と、レシピ ID だけの古い形 */
export type ExcludedProposal = string[] | { recipeId: string; servings: number }[]

export function recommend(input: RecommendInput): RecommendResult {
  const targetMeals = input.targetMeals ?? DEFAULT_TARGET_MEALS
  const maxProposals = input.options?.maxProposals ?? MAX_PROPOSALS
  const step = input.options?.servingsStep ?? SERVINGS_STEP
  const lambda = input.options?.diversityLambda ?? DIVERSITY_LAMBDA
  const weights: RecommendWeights = { ...RECOMMEND_WEIGHTS, ...input.weights }
  const ctx: Ctx = { available: input.available, ingredients: input.ingredients, today: input.today }

  const fixedServings = new Map((input.fixed ?? []).map((f) => [f.recipe.id, f.servings]))
  const anchorIds = new Set(input.anchors.map((a) => a.recipe.id))
  const fixedAdded = (input.fixed ?? []).filter((f) => !anchorIds.has(f.recipe.id))
  const baseIds = new Set([...anchorIds, ...fixedAdded.map((f) => f.recipe.id)])
  const fixedIds = new Set([...fixedServings.keys()])

  const all = new Map<string, RecRecipe>()
  for (const r of [...input.catalog, ...input.anchors.map((a) => a.recipe), ...fixedAdded.map((f) => f.recipe)]) {
    all.set(r.id, r)
  }
  const features = recipeFeatures([...all.values()], input.ingredients)
  const unitPrices = scoreUnitPrices(input.ingredients)
  const featureOf = (r: RecRecipe) => features.get(r.id) as RecipeFeatures

  // ---- 前に出した案 ----
  // 料理の組み合わせ（anchor と固定を除いた料理）で比べ、食数だけ違う案も出した案として除く。
  // 新しい形（食数付き）の食数は、似ている度合い（食数の形）を比べるのに使う
  const exactKey = (entries: { recipeId: string; servings: number }[]) =>
    entries
      .filter((e) => !fixedIds.has(e.recipeId))
      .map((e) => `${e.recipeId}:${e.servings}`)
      .sort()
      .join('\n')
  const setKey = (ids: string[]) =>
    ids
      .filter((id) => !baseIds.has(id))
      .sort()
      .join('\n')
  const exclude = input.exclude ?? []
  const idsOf = (p: ExcludedProposal) =>
    p.length > 0 && typeof p[0] !== 'string'
      ? (p as { recipeId: string; servings: number }[]).map((e) => e.recipeId)
      : (p as string[])
  const excludedSets = new Set(exclude.map((p) => setKey(idsOf(p))))
  const keyOf = (s: MealScored) => exactKey(s.items.map((i) => ({ recipeId: i.recipe.id, servings: i.servings })))
  const addedKeyOf = (s: MealScored) => setKey(s.added.map((r) => r.id))
  const isExcluded = (s: MealScored) => excludedSets.has(addedKeyOf(s))
  /** 同じ料理の組み合わせは、点数のいちばん良い食数の 1 つだけ残す（results は点数順） */
  const uniqueSets = (list: MealScored[]) => {
    const seen = new Set<string>()
    return list.filter((s) => {
      const key = addedKeyOf(s)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  const profileOf = (items: { recipe: RecRecipe; servings: number | null }[]): Profile => {
    const added = items.filter((i) => !baseIds.has(i.recipe.id)).map((i) => featureOf(i.recipe))
    const mainCuisines = [
      ...new Set(added.filter((f) => f.dishType === 'main' && f.cuisine).map((f) => f.cuisine as string)),
    ].sort()
    const servings = items.map((i) => i.servings)
    return {
      ids: new Set(items.filter((i) => !baseIds.has(i.recipe.id)).map((i) => i.recipe.id)),
      mains: new Set(added.flatMap((f) => (f.mainIngredientId ? [f.mainIngredientId] : []))),
      heat: new Set(added.flatMap((f) => (f.heatMode ? [f.heatMode] : []))),
      mainCuisine: mainCuisines.length > 0 ? mainCuisines.join() : null,
      mixing: added.filter((f) => f.usesMixingUnit).length,
      shape: servings.some((x) => x === null) ? null : (servings as number[]).sort((a, b) => b - a).join(),
    }
  }
  // 似ている度合いは新しいほうの案とだけ比べる（古い案は除くだけ）
  const previous = exclude.slice(-DIVERSITY_RECENT_EXCLUDES).flatMap((p) => {
    const entries =
      p.length > 0 && typeof p[0] !== 'string'
        ? (p as { recipeId: string; servings: number }[])
        : (p as string[]).map((recipeId) => ({ recipeId, servings: null }))
    const items = entries.flatMap((e) => {
      const recipe = all.get(e.recipeId)
      return recipe ? [{ recipe, servings: e.servings }] : []
    })
    return items.length > 0 ? [profileOf(items)] : []
  })

  // ---- 食数が決まっている料理（固定した anchor と追加料理）と、配り直す anchor ----
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
  const scoreItems = (items: MealItem[], added: RecRecipe[]): MealScored => {
    const evaluation = evaluate(items, ctx)
    const { score, breakdown } = scoreProposal(
      items.map((i) => ({ recipeId: i.recipe.id, servings: i.servings, role: i.role, wantedServings: i.wanted })),
      { shopping: evaluation.score, buyYen: scoreBuyYen(evaluation.shopping, unitPrices) },
      features,
      weights,
    )
    return { items, added, evaluation, score, breakdown }
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
    const s = scoreItems([...fixedItems, ...wantedAnchors], [])
    return {
      proposals: isExcluded(s) ? [] : [asProposal(s)],
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
      return { recipe: c, score: scoreItems([...fixedItems, ...wantedAnchors, item], [c]).score }
    })
    .sort((a, b) => a.score - b.score || a.recipe.id.localeCompare(b.recipe.id))
  const maxAdd = Math.max(0, Math.min(3, MAX_DISHES - fixedItems.length - freeAnchors.length))
  const anchorOptions = freeAnchors.map((a) => allowedServings(featureOf(a.recipe), step))

  // ---- 候補の枠 ----
  const expiringIds = new Set(
    input.available.filter((a) => a.expiresOn <= addDays(input.today, EXPIRING_SOON_DAYS)).map((a) => a.ingredientId),
  )
  const baseTypes = new Set(
    [...fixedItems.map((i) => i.recipe), ...freeAnchors.map((a) => a.recipe)].map((r) => featureOf(r).dishType),
  )
  const missingTypes = (['main', 'side', 'soup'] as const).filter((t) => !baseTypes.has(t))
  const byPopularity = [...singles]
    .filter((s) => featureOf(s.recipe).popularity > 0)
    .sort((a, b) => featureOf(b.recipe).popularity - featureOf(a.recipe).popularity)
  const poolOf = (round: number): RecRecipe[] => {
    const grow = CANDIDATE_POOL.growth ** round
    const n = (base: number) => Math.ceil(base * grow)
    const slots: RecRecipe[][] = [
      singles.slice(0, n(CANDIDATE_POOL.score)).map((s) => s.recipe),
      singles
        .filter((s) => s.recipe.ingredients.some((i) => expiringIds.has(i.ingredientId)))
        .slice(0, n(CANDIDATE_POOL.expiring))
        .map((s) => s.recipe),
      byPopularity.slice(0, n(CANDIDATE_POOL.popular)).map((s) => s.recipe),
      ...missingTypes.map((t) =>
        singles
          .filter((s) => featureOf(s.recipe).dishType === t)
          .slice(0, n(CANDIDATE_POOL.perMissingType))
          .map((s) => s.recipe),
      ),
    ]
    // 単品の点数の枠を 2 件、ほかの枠を 1 件ずつ交互に取り、上から使う件数を絞っても枠の料理が残るようにする
    const pool: RecRecipe[] = []
    const seen = new Set<string>()
    const push = (r: RecRecipe | undefined) => {
      if (r && !seen.has(r.id) && pool.length < CANDIDATE_POOL.max) {
        seen.add(r.id)
        pool.push(r)
      }
    }
    const longest = Math.max(...slots.map((s) => s.length))
    for (let i = 0; i < longest; i++) {
      push(slots[0]?.[2 * i])
      push(slots[0]?.[2 * i + 1])
      for (const slot of slots.slice(1)) push(slot[i])
    }
    // 主な食材が候補に少ないもの
    const mains = new Set(pool.map((r) => featureOf(r).mainIngredientId))
    let rare = 0
    for (const s of singles) {
      if (rare >= n(CANDIDATE_POOL.rareMain)) break
      const main = featureOf(s.recipe).mainIngredientId
      if (seen.has(s.recipe.id) || mains.has(main)) continue
      mains.add(main)
      push(s.recipe)
      rare++
    }
    return pool
  }

  const search = (round: number, limit = MAX_EVALUATIONS) => {
    // 1 回の呼び出し全体の上限（探し直しを重ねても Workers の CPU 時間に収める）
    const maxEvaluations = Math.min(limit, MAX_EVALUATIONS_PER_CALL - evaluations)
    const pool = poolOf(round)
    const grow = CANDIDATE_POOL.growth ** round
    const results: MealScored[] = []
    // 次の回で候補を広げられるか（上から使う件数で切った、または枠を広げると候補が増える）
    let sliced = false
    let evals = 0
    const searchGoal = (goal: number) => {
      for (let addCount = 0; addCount <= maxAdd; addCount++) {
        const size = Math.min(pool.length, Math.ceil((CANDIDATES_BY_ADD_COUNT[addCount] ?? 0) * grow))
        if (addCount > 0 && size < pool.length) sliced = true
        const list = addCount === 0 ? [] : pool.slice(0, size)
        if (addCount > 0 && list.length < addCount) break
        // 品数ごとに評価の回数を分ける（多い品数の組み合わせまで届くように）
        const budget = evals + Math.floor((maxEvaluations - evals) / (maxAdd - addCount + 1))
        outer: for (const added of addCount === 0 ? [[] as RecRecipe[]] : combinations(list, addCount)) {
          const options = [...anchorOptions, ...added.map((r) => allowedServings(featureOf(r), step))]
          for (const alloc of allocations(options, goal)) {
            if (evals >= budget) break outer
            evals++
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
            results.push(scoreItems(items, added))
          }
        }
      }
    }
    // anchor や固定に刻みより少ししか作れない料理があると、合計が目標ぴったりにならないことがある。
    // そのときは目標以下でいちばん近い合計を探す
    for (let goal = restMeals; goal > restMeals - step && results.length === 0 && goal > 0; goal--) searchGoal(goal)
    evaluations += evals
    results.sort((a, b) => a.score - b.score || keyOf(a).localeCompare(keyOf(b)))
    return { results, canGrow: sliced || poolOf(round + 1).length > pool.length }
  }

  // 「別の案を出す」の回は、出した案の数から出す。残りがなければ枠を広げて探し直す
  let round = Math.ceil(exclude.length / maxProposals)
  let found = search(round)
  // AI 補完をすすめるかは、1 回目と同じ探索のいちばん良い案で決める（「別の案を出す」で変わらないように）
  const first = round === 0 ? found : search(0)
  if (first.results.length === 0) return baseOnly(candidates.length === 0)
  const best = first.results[0]
  const aiSuggestionRecommended =
    candidates.length === 0 ||
    (best?.evaluation.maxPerishableLeftoverPacks ?? 0) >= SCORE_WEIGHTS.aiSuggestionLeftoverPacks - EPS
  let remaining = uniqueSets(found.results.filter((s) => !isExcluded(s)))
  // 探し直しは評価の回数を減らし、呼び出し全体の上限に達したらやめる
  for (
    let extra = 0;
    remaining.length === 0 && found.canGrow && extra < MAX_EXTRA_ROUNDS && evaluations < MAX_EVALUATIONS_PER_CALL;
    extra++
  ) {
    round++
    found = search(round, MAX_EVALUATIONS / 2)
    remaining = uniqueSets(found.results.filter((s) => !isExcluded(s)))
  }
  // 広げても出していない案が残らなければ、出し尽くした（次も同じ結果なので hasMore は false）
  if (remaining.length === 0) return { proposals: [], aiSuggestionRecommended, hasMore: false, evaluations }

  // ---- 多様性を見ながら選ぶ（MMR）----
  const pool = remaining.slice(0, DIVERSITY_CANDIDATES).map((s) => ({ s, profile: profileOf(s.items) }))
  const picked: typeof pool = []
  const pickedKeys = new Set<string>()
  while (picked.length < maxProposals) {
    let choice: (typeof pool)[number] | null = null
    let choiceValue = Number.POSITIVE_INFINITY
    for (const c of pool) {
      if (pickedKeys.has(addedKeyOf(c.s))) continue
      let maxSim = 0
      for (const other of [...picked.map((p) => p.profile), ...previous]) {
        maxSim = Math.max(maxSim, similarity(c.profile, other))
      }
      const value = c.s.score + lambda * maxSim
      if (value < choiceValue - EPS) {
        choice = c
        choiceValue = value
      }
    }
    if (!choice) break
    picked.push(choice)
    pickedKeys.add(addedKeyOf(choice.s))
  }
  const left = new Set(remaining.map(addedKeyOf))
  return {
    proposals: picked.map((p) => asProposal(p.s)),
    aiSuggestionRecommended,
    hasMore: left.size > pickedKeys.size || found.canGrow,
    evaluations,
  }
}
