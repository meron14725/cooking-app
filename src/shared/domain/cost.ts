/**
 * 献立の推定金額（docs/design/10-cost.md）。DB に依存しない純粋関数。
 * 買う量は evaluate()（または買い物リストの行）で決まっていて、ここでは量 × 単価で金額を出すだけ。
 */
import { SCORE_WEIGHTS, STAPLE_COST_PER_MEAL_YEN } from './constants'
import {
  type Evaluation,
  perishability,
  type RecIngredient,
  type RecPackageUnit,
  representativeQuantity,
} from './recommend'

export type Cost = {
  /** 今回買う分 */
  buyYen: number
  /** 冷蔵庫（在庫）から使う分 */
  fromFridgeYen: number
  /** 新しく生まれる余り */
  leftoverYen: number
  /** 余りのうち冷蔵のみの食材 */
  leftoverPerishableYen: number
  /** 料理で使う分 = 買う分 − 余り + 冷蔵庫から使う分 */
  eatYen: number
  /** 食べる分 ÷ 合計食数 + 調味料などの固定費。食数が 0 なら null */
  perMealYen: number | null
  totalMeals: number
  /** 常備品を除く、買う・使う食材のうち価格が未設定のもの */
  unpriced: { ingredientId: string; name: string }[]
  unpricedCount: number
  hasUnpriced: boolean
}

/** 表示は 10 円単位 */
export function roundYen(yen: number): number {
  return Math.round(yen / 10) * 10
}

/** 基準単位あたりの価格。価格がなければ null */
export function unitPrice(ing: RecIngredient): number | null {
  if (ing.priceYen === null || ing.priceYen === undefined) return null
  return ing.priceYen / representativeQuantity(ing)
}

/** 代表量の名前（「3個入り」「100g」「1個」）。価格の欄のラベルに使う */
export function representativeLabel(ing: {
  unit: string
  packageUnits: Pick<RecPackageUnit, 'label' | 'quantity' | 'isDefault'>[]
}): string {
  const def = ing.packageUnits.find((u) => u.isDefault) ?? ing.packageUnits[0]
  if (def && def.quantity > 0) return def.label
  return ing.unit === 'g' ? `${SCORE_WEIGHTS.gramsRepresentative}g` : `1${ing.unit}`
}

/**
 * 代表の販売単位を変えたときに、単価が変わらないように価格を換算する。
 * どちらかの代表量が 0 以下なら換算しない
 */
export function rescalePrice(priceYen: number, oldRepresentative: number, newRepresentative: number): number {
  if (oldRepresentative <= 0 || newRepresentative <= 0) return priceYen
  return Math.round((priceYen * newRepresentative) / oldRepresentative)
}

class Tally {
  private raw = { buy: 0, fromFridge: 0, leftover: 0, leftoverPerishable: 0, eat: 0 }
  private unpriced = new Map<string, string>()

  constructor(private readonly ingredients: Map<string, RecIngredient>) {}

  /** 量 × 単価。常備品は数えない。価格がなければ未設定に入れて 0 円 */
  private yen(ingredientId: string, quantity: number): number {
    const ing = this.ingredients.get(ingredientId)
    if (!ing || ing.isStaple || quantity <= 0) return 0
    const price = unitPrice(ing)
    if (price === null) {
      this.unpriced.set(ing.id, ing.name)
      return 0
    }
    return quantity * price
  }

  add(kind: 'buy' | 'fromFridge' | 'eat', ingredientId: string, quantity: number) {
    this.raw[kind] += this.yen(ingredientId, quantity)
  }

  /** 金額をそのまま足す（払った金額） */
  addBuyYen(yen: number) {
    this.raw.buy += yen
  }

  addLeftover(ingredientId: string, quantity: number) {
    const yen = this.yen(ingredientId, quantity)
    this.raw.leftover += yen
    const ing = this.ingredients.get(ingredientId)
    if (ing && perishability(ing) >= SCORE_WEIGHTS.perishability.fridgeOnly) this.raw.leftoverPerishable += yen
  }

  /** eatYen を直接足さなかったときは、買う − 余り + 冷蔵庫から で出す */
  result(totalMeals: number, eat?: number): Cost {
    const r = this.raw
    const eatYen = eat ?? Math.max(0, r.buy - r.leftover + r.fromFridge)
    const unpriced = [...this.unpriced].map(([ingredientId, name]) => ({ ingredientId, name }))
    return {
      buyYen: roundYen(r.buy),
      fromFridgeYen: roundYen(r.fromFridge),
      leftoverYen: roundYen(r.leftover),
      leftoverPerishableYen: roundYen(r.leftoverPerishable),
      eatYen: roundYen(eatYen),
      perMealYen: totalMeals > 0 ? roundYen(eatYen / totalMeals + STAPLE_COST_PER_MEAL_YEN) : null,
      totalMeals,
      unpriced,
      unpricedCount: unpriced.length,
      hasUnpriced: unpriced.length > 0,
    }
  }

  get eatRaw() {
    return this.raw.eat
  }
  get buyRaw() {
    return this.raw.buy
  }
}

/** 提案（evaluate の結果）の金額 */
export function costOfEvaluation(
  evaluation: Pick<Evaluation, 'shopping' | 'leftovers' | 'usesInventory'>,
  ingredients: Map<string, RecIngredient>,
  totalMeals: number,
): Cost {
  const t = new Tally(ingredients)
  for (const line of evaluation.shopping) t.add('buy', line.ingredientId, line.buyQuantity)
  for (const use of evaluation.usesInventory) t.add('fromFridge', use.ingredientId, use.quantity)
  for (const left of evaluation.leftovers) t.addLeftover(left.ingredientId, left.quantity)
  return t.result(totalMeals)
}

export type ShoppingCostRow = {
  ingredientId: string
  needQuantity: number
  buyQuantity: number
  isManual: boolean
  checked: boolean
  /** 払った金額。入っていれば、この行の買う分はこの値にする */
  paidYen?: number | null
}

export type ShoppingCost = Cost & {
  /** チェックしていない行だけの「あと ◯ 円」 */
  remainingYen: number
}

/**
 * 買い物リストの金額。確定後に個数を直したり手で行を足したりできるので、今の行から計算し直す。
 * - 手で足した行は買う分に入れ、余りには入れない
 * - 食べる分は献立の料理の材料（食数で倍率）から出し、冷蔵庫から使う分 = 食べる分 − 不足量（買う必要があった分）。
 *   個数を不足量より減らしても、減らした分を冷蔵庫から使う分には数えない
 */
export function costOfShopping(input: {
  rows: ShoppingCostRow[]
  /** 献立の料理で使う量（食材ごと、基準単位。少々と常備品は入れても数えない） */
  eatQuantities: Map<string, number>
  ingredients: Map<string, RecIngredient>
  totalMeals: number
}): ShoppingCost {
  const t = new Tally(input.ingredients)
  const remaining = new Tally(input.ingredients)
  const recipeLines = new Map<string, { need: number; buy: number }>()
  for (const row of input.rows) {
    const paid = row.paidYen ?? null
    if (paid === null) t.add('buy', row.ingredientId, row.buyQuantity)
    else t.addBuyYen(paid)
    if (!row.checked) {
      if (paid === null) remaining.add('buy', row.ingredientId, row.buyQuantity)
      else remaining.addBuyYen(paid)
    }
    if (row.isManual) continue
    const line = recipeLines.get(row.ingredientId) ?? { need: 0, buy: 0 }
    line.need += row.needQuantity
    line.buy += row.buyQuantity
    recipeLines.set(row.ingredientId, line)
  }
  // 不足量は確定のときに在庫で足りなかった分。手で足した行は入れない
  const shortfall = new Tally(input.ingredients)
  for (const [ingredientId, line] of recipeLines) {
    shortfall.add('buy', ingredientId, line.need)
    t.addLeftover(ingredientId, line.buy - line.need)
  }
  for (const [ingredientId, quantity] of input.eatQuantities) t.add('eat', ingredientId, quantity)
  const eat = t.eatRaw
  const fromFridge = Math.max(0, eat - shortfall.buyRaw)
  const cost = t.result(input.totalMeals, eat)
  return { ...cost, fromFridgeYen: roundYen(fromFridge), remainingYen: roundYen(remaining.buyRaw) }
}
