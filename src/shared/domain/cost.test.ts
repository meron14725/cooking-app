import { describe, expect, it } from 'vitest'
import { STAPLE_COST_PER_MEAL_YEN } from './constants'
import { costOfEvaluation, costOfShopping, representativeLabel, rescalePrice, roundYen, unitPrice } from './cost'
import { evaluate, type RecIngredient, type RecRecipe } from './recommend'

const today = '2026-11-27'

const ing = (id: string, over: Partial<RecIngredient> = {}): RecIngredient => ({
  id,
  name: id,
  unit: '個',
  isStaple: false,
  canFreeze: true,
  pantryDays: null,
  preppedFridgeDays: null,
  packageUnits: [],
  priceYen: null,
  ...over,
})
const pkg = (id: string, quantity: number, isDefault = false) => ({ id, label: id, quantity, isDefault })

// 玉ねぎ 3 個入り 150 円（1 個 50 円）/ 豚こま 200g 300 円（1g 1.5 円）/ 豆腐 1 丁 80 円（冷蔵のみ）
const masters = [
  ing('onion', { pantryDays: 30, priceYen: 150, packageUnits: [pkg('3個入り', 3, true)] }),
  ing('pork', { unit: 'g', priceYen: 300, packageUnits: [pkg('200gパック', 200, true)] }),
  ing('tofu', { unit: '丁', canFreeze: false, priceYen: 80, packageUnits: [pkg('1丁', 1, true)] }),
  ing('carrot', { pantryDays: 30, packageUnits: [pkg('3本', 3, true)] }),
  ing('soy', { unit: 'ml', isStaple: true }),
]
const ingredients = new Map(masters.map((m) => [m.id, m]))

const recipe = (id: string, parts: [string, number | null][]): RecRecipe => ({
  id,
  title: id,
  servings: 1,
  caloriesKcal: 400,
  maxServings1_6l: 4,
  ingredients: parts.map(([ingredientId, quantity]) => ({ ingredientId, quantity })),
})

describe('単価と代表量', () => {
  it('代表量あたりの価格を代表量で割る。g で販売単位がなければ 100g あたり', () => {
    expect(unitPrice(ingredients.get('onion') as RecIngredient)).toBe(50)
    expect(unitPrice(ing('mince', { unit: 'g', priceYen: 120 }))).toBeCloseTo(1.2)
    expect(unitPrice(ingredients.get('carrot') as RecIngredient)).toBeNull()
  })

  it('代表量の名前', () => {
    expect(representativeLabel(ingredients.get('onion') as RecIngredient)).toBe('3個入り')
    expect(representativeLabel(ing('mince', { unit: 'g' }))).toBe('100g')
    expect(representativeLabel(ing('egg'))).toBe('1個')
  })

  it('代表の販売単位を変えても単価が変わらないように換算する', () => {
    expect(rescalePrice(198, 3, 1)).toBe(66)
    expect(rescalePrice(300, 200, 400)).toBe(600)
    expect(rescalePrice(100, 0, 1)).toBe(100)
  })

  it('10 円単位に丸める', () => {
    expect(roundYen(2384)).toBe(2380)
    expect(roundYen(2385)).toBe(2390)
  })
})

describe('提案の金額', () => {
  it('買う分・余り・1 食あたり。余りは食べる分に入れない', () => {
    // 玉ねぎ 1 個・豚こま 100g × 2 食 → 玉ねぎ 3 個入り（150 円、1 個余り 50 円）、豚こま 200g（300 円、ぴったり）
    const e = evaluate(
      [
        {
          recipe: recipe('r', [
            ['onion', 0.5],
            ['pork', 100],
          ]),
          servings: 2,
        },
      ],
      {
        available: [],
        ingredients,
        today,
      },
    )
    const cost = costOfEvaluation(e, ingredients, 2)
    expect(cost.buyYen).toBe(450)
    expect(cost.leftoverYen).toBe(100)
    expect(cost.leftoverPerishableYen).toBe(0)
    expect(cost.fromFridgeYen).toBe(0)
    expect(cost.eatYen).toBe(350)
    expect(cost.perMealYen).toBe(roundYen(350 / 2 + STAPLE_COST_PER_MEAL_YEN))
    expect(cost.hasUnpriced).toBe(false)
  })

  it('冷蔵庫から使う分は買う分に入れず、食べる分には入れる', () => {
    const e = evaluate([{ recipe: recipe('r', [['tofu', 1]]), servings: 1 }], {
      available: [{ inventoryItemId: 's1', ingredientId: 'tofu', quantity: 1, expiresOn: '2026-12-05' }],
      ingredients,
      today,
    })
    const cost = costOfEvaluation(e, ingredients, 1)
    expect(cost.buyYen).toBe(0)
    expect(cost.fromFridgeYen).toBe(80)
    expect(cost.eatYen).toBe(80)
  })

  it('冷蔵のみの食材の余りは「傷みやすい」に分ける', () => {
    const tofu2 = new Map(ingredients)
    tofu2.set('tofu', ing('tofu', { unit: '丁', canFreeze: false, priceYen: 160, packageUnits: [pkg('2丁', 2, true)] }))
    const e = evaluate([{ recipe: recipe('r', [['tofu', 1]]), servings: 1 }], {
      available: [],
      ingredients: tofu2,
      today,
    })
    const cost = costOfEvaluation(e, tofu2, 1)
    expect(cost.leftoverYen).toBe(80)
    expect(cost.leftoverPerishableYen).toBe(80)
  })

  it('価格未設定は 0 円にして数える。常備品は価格が NULL でも数えず、合計にも入れない', () => {
    const e = evaluate(
      [
        {
          recipe: recipe('r', [
            ['carrot', 1],
            ['soy', 15],
            ['onion', null],
          ]),
          servings: 1,
        },
      ],
      {
        available: [],
        ingredients,
        today,
      },
    )
    const cost = costOfEvaluation(e, ingredients, 1)
    expect(cost.buyYen).toBe(0)
    expect(cost.unpriced).toEqual([{ ingredientId: 'carrot', name: 'carrot' }])
    expect(cost.unpricedCount).toBe(1)
    expect(cost.hasUnpriced).toBe(true)
  })

  it('食数が 0 なら 1 食あたりは null', () => {
    expect(costOfEvaluation({ shopping: [], leftovers: [], usesInventory: [] }, ingredients, 0).perMealYen).toBeNull()
  })
})

describe('買い物リストの金額', () => {
  const row = (ingredientId: string, needQuantity: number, buyQuantity: number, over = {}) => ({
    ingredientId,
    needQuantity,
    buyQuantity,
    isManual: false,
    checked: false,
    ...over,
  })

  it('今の行から計算する。手で足した行は買う分に入れ、余りには入れない', () => {
    const cost = costOfShopping({
      rows: [row('onion', 1, 3), row('pork', 200, 200, { checked: true }), row('tofu', 0, 1, { isManual: true })],
      eatQuantities: new Map([
        ['onion', 1],
        ['pork', 200],
      ]),
      ingredients,
      totalMeals: 2,
    })
    expect(cost.buyYen).toBe(150 + 300 + 80)
    expect(cost.leftoverYen).toBe(100)
    expect(cost.eatYen).toBe(350)
    expect(cost.fromFridgeYen).toBe(0)
    // チェックしていない行だけ（玉ねぎと手で足した豆腐）
    expect(cost.remainingYen).toBe(230)
  })

  it('1 食材を複数の販売単位で買ったとき（不足量は最初の行だけ）も、食材ごとに余りを出す', () => {
    const cost = costOfShopping({
      rows: [row('pork', 300, 200), row('pork', 0, 200)],
      eatQuantities: new Map([['pork', 300]]),
      ingredients,
      totalMeals: 1,
    })
    expect(cost.buyYen).toBe(600)
    expect(cost.leftoverYen).toBe(150)
  })

  it('冷蔵庫から使う分 = 食べる分 − (料理の行の買う分 − 余り)', () => {
    // 玉ねぎを 2 個使い、1 個は在庫。足りない 1 個のために 3 個入りを買う
    const cost = costOfShopping({
      rows: [row('onion', 1, 3)],
      eatQuantities: new Map([['onion', 2]]),
      ingredients,
      totalMeals: 2,
    })
    expect(cost.eatYen).toBe(100)
    expect(cost.leftoverYen).toBe(100)
    expect(cost.fromFridgeYen).toBe(50)
  })

  it('個数を不足量より減らしても、減らした分を冷蔵庫から使う分に数えない', () => {
    // 豚こまを 300g 使い、在庫 100g。不足 200g のところ、買う量を 0 に直した
    const cost = costOfShopping({
      rows: [row('pork', 200, 0)],
      eatQuantities: new Map([['pork', 300]]),
      ingredients,
      totalMeals: 1,
    })
    expect(cost.fromFridgeYen).toBe(150)
    expect(cost.leftoverYen).toBe(0)
  })

  it('払った金額が入った行は、その値を買う分にする', () => {
    const cost = costOfShopping({
      rows: [row('onion', 1, 3, { paidYen: 120, checked: true }), row('pork', 200, 200)],
      eatQuantities: new Map([
        ['onion', 1],
        ['pork', 200],
      ]),
      ingredients,
      totalMeals: 2,
    })
    expect(cost.buyYen).toBe(120 + 300)
    expect(cost.remainingYen).toBe(300)
  })

  it('常備品は価格が NULL でも未設定に数えない', () => {
    const cost = costOfShopping({
      rows: [row('carrot', 1, 3)],
      eatQuantities: new Map([
        ['carrot', 1],
        ['soy', 30],
      ]),
      ingredients,
      totalMeals: 1,
    })
    expect(cost.unpriced.map((u) => u.ingredientId)).toEqual(['carrot'])
  })
})
