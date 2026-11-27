import { describe, expect, it } from 'vitest'
import { FALLBACK_PRICE_PER_PACK_YEN, PACK_YEN } from './constants'
import { type RecIngredient, recommend, scoreBuyYen, scorePacks, scoreUnitPrices } from './recommend'
import { fixtureCatalog, fixtureIngredients } from './testing/catalog'

const onion = fixtureIngredients.get('onion') as RecIngredient // 3 個入りが代表
const chicken = fixtureIngredients.get('chicken') as RecIngredient // 300g が代表

const priced = (ing: RecIngredient, priceYen: number | null): RecIngredient => ({ ...ing, priceYen })

describe('scorePacks（点数のパック換算）', () => {
  it('価格がなければ量 ÷ 代表量（今と同じ）', () => {
    expect(scorePacks(onion, 3)).toBe(1)
    expect(scorePacks(chicken, 150)).toBe(0.5)
  })

  it('価格があれば金額を PACK_YEN でパックの数にそろえる', () => {
    // 3 個 150 円 → 150 / 200 = 0.75 パック
    expect(scorePacks(priced(onion, 150), 3)).toBeCloseTo(150 / PACK_YEN)
    // 300g 600 円の半分 → 300 / 200 = 1.5 パック
    expect(scorePacks(priced(chicken, 600), 150)).toBeCloseTo(1.5)
    // ちょうど PACK_YEN なら今と同じ
    expect(scorePacks(priced(onion, PACK_YEN), 3)).toBeCloseTo(1)
  })
})

describe('scoreUnitPrices（点数で使う単価）', () => {
  it('価格があればその単価。未設定は同じ分類・同じ基準単位の中央値、なければ仮の価格', () => {
    const map = new Map<string, RecIngredient>([
      ['a', { ...onion, id: 'a', priceYen: 90 }], // 3 個 90 円 → 30 円 / 個
      ['b', { ...onion, id: 'b', priceYen: 150 }], // 50 円 / 個
      ['c', { ...onion, id: 'c', priceYen: 300 }], // 100 円 / 個
      ['d', { ...onion, id: 'd', priceYen: null }],
      ['e', { ...chicken, id: 'e', priceYen: null }],
      ['salt', { ...onion, id: 'salt', priceYen: 10_000, isStaple: true }],
    ])
    const prices = scoreUnitPrices(map)
    expect(prices.get('a')).toBeCloseTo(30)
    // 野菜・個の中央値（常備品は数えない）
    expect(prices.get('d')).toBeCloseTo(50)
    // 肉・g は価格のある食材がないので、代表量 300g を FALLBACK_PRICE_PER_PACK_YEN とみなす
    expect(prices.get('e')).toBeCloseTo(FALLBACK_PRICE_PER_PACK_YEN / 300)
    expect(prices.has('salt')).toBe(false)
  })

  it('買う金額は買う量 × 単価の合計', () => {
    const prices = new Map([
      ['onion', 50],
      ['chicken', 2],
    ])
    expect(
      scoreBuyYen(
        [
          { ingredientId: 'onion', buyQuantity: 3 },
          { ingredientId: 'chicken', buyQuantity: 300 },
        ],
        prices,
      ),
    ).toBe(750)
  })
})

describe('recommend の金額の項', () => {
  const run = (ingredients: Map<string, RecIngredient>) =>
    recommend({
      catalog: fixtureCatalog,
      available: [],
      ingredients,
      today: '2026-11-27',
      targetMeals: 6,
      anchors: [
        { recipe: fixtureCatalog.find((r) => r.id === 'curry') as (typeof fixtureCatalog)[number], servings: 2 },
      ],
    })
  const withPrice = (yen: number) =>
    new Map([...fixtureIngredients].map(([id, ing]) => [id, { ...ing, priceYen: yen }] as const))

  it('内訳に cost があり、1 食あたりの買う金額が上がると cost も上がる', () => {
    const cheap = run(withPrice(100)).proposals[0]
    const expensive = run(withPrice(400)).proposals[0]
    expect(cheap?.scoreBreakdown?.cost).toBeGreaterThan(0)
    expect(expensive?.scoreBreakdown?.cost).toBeGreaterThan(cheap?.scoreBreakdown?.cost ?? 0)
  })

  it('高い食材を使う料理は選ばれにくい', () => {
    const base = run(withPrice(PACK_YEN))
    const added = base.proposals[0]?.recipes.find((x) => x.role === 'added')
    expect(added).toBeDefined()
    // いちばん良い案の追加料理の材料を、ほかの 10 倍の値段にする
    const recipe = fixtureCatalog.find((r) => r.id === added?.recipeId)
    const expensive = withPrice(PACK_YEN)
    for (const ri of recipe?.ingredients ?? []) {
      const ing = expensive.get(ri.ingredientId)
      if (
        ing &&
        !(fixtureCatalog.find((r) => r.id === 'curry')?.ingredients ?? []).some((c) => c.ingredientId === ing.id)
      )
        expensive.set(ing.id, { ...ing, priceYen: PACK_YEN * 10 })
    }
    const after = run(expensive)
    expect(after.proposals[0]?.recipes.some((x) => x.recipeId === added?.recipeId)).toBe(false)
  })
})
