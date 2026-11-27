/**
 * レコメンド（docs/design/05-recommendation.md）。DB に依存しない純粋関数。
 * 食べたい料理（anchor）に、買ったパックを食べ切れる追加料理を組み合わせた案を出す。
 */
import {
  DEFAULT_PREPPED_FRIDGE_DAYS,
  DEFAULT_SERVINGS,
  MAX_PROPOSALS,
  SCORE_WEIGHTS,
  TARGET_RECIPE_COUNT,
} from './constants'
import { expiryOf } from './expiry'

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
  options?: { targetCount?: number; maxProposals?: number; defaultServings?: number }
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

export type Leftover = { ingredientId: string; name: string; quantity: number; unit: string; perishable: boolean }

export type InventoryUse = {
  inventoryItemId: string
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
  recipes: ProposalRecipe[]
  kitLocations: { recipeId: string; location: 'fridge' | 'freezer' }[]
  totalCaloriesKcal: number | null
  warnings: string[]
}

export type RecommendResult = { proposals: Proposal[]; aiSuggestionRecommended: boolean }

// ---------- 小さな関数 ----------

const EPS = 1e-9
const round = (n: number) => Math.round(n * 1000) / 1000

/** 代表量: 代表の販売単位 → 最初の販売単位 → 基準単位 1 つ分（g なら 100g） */
export function representativeQuantity(ing: RecIngredient): number {
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
        leftovers.push({ ingredientId, name: ing.name, quantity: leftover, unit: ing.unit, perishable })
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

export function recommend(input: RecommendInput): RecommendResult {
  const targetCount = input.options?.targetCount ?? TARGET_RECIPE_COUNT
  const maxProposals = input.options?.maxProposals ?? MAX_PROPOSALS
  const defaultServings = input.options?.defaultServings ?? DEFAULT_SERVINGS
  const ctx: Ctx = { available: input.available, ingredients: input.ingredients, today: input.today }
  const anchors = input.anchors.map((a) => ({ ...a, role: 'anchor' as const }))
  const addCount = targetCount - anchors.length

  // anchor だけで目標の品数に届いていれば探索しない
  if (addCount <= 0) {
    const evaluation = evaluate(anchors, ctx)
    return { proposals: [buildProposal(anchors, evaluation, input.ingredients)], aiSuggestionRecommended: false }
  }

  const anchorIds = new Set(anchors.map((a) => a.recipe.id))
  const candidates = input.catalog.filter((r) => !anchorIds.has(r.id) && fitsPot(r, defaultServings))
  if (candidates.length === 0) {
    const evaluation = evaluate(anchors, ctx)
    return { proposals: [buildProposal(anchors, evaluation, input.ingredients)], aiSuggestionRecommended: true }
  }

  const k = Math.min(addCount, candidates.length)
  const scored: { added: RecRecipe[]; evaluation: Evaluation }[] = []
  for (const added of combinations(candidates, k)) {
    const items = [...anchors, ...added.map((recipe) => ({ recipe, servings: defaultServings }))]
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

  // 似た案（追加料理が 1 品でも同じ）を避けて上位を選び、足りなければ飛ばした案で埋める
  const picked: typeof scored = []
  const skipped: typeof scored = []
  const usedAdded = new Set<string>()
  for (const s of scored) {
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
      [...anchors, ...s.added.map((recipe) => ({ recipe, servings: defaultServings, role: 'added' as const }))],
      s.evaluation,
      input.ingredients,
    ),
  )
  const best = proposals[0]
  return {
    proposals,
    aiSuggestionRecommended: !best || best.maxPerishableLeftoverPacks >= SCORE_WEIGHTS.aiSuggestionLeftoverPacks - EPS,
  }
}
