import { describe, expect, it } from 'vitest'
import { addDays } from './date'
import {
  type AvailableStock,
  choosePurchase,
  evaluate,
  evaluatePlan,
  kitLocation,
  orderDays,
  type RecIngredient,
  type RecRecipe,
  recommend,
  representativeQuantity,
} from './recommend'

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
  ...over,
})
const pkg = (id: string, quantity: number, isDefault = false) => ({ id, label: `${id}`, quantity, isDefault })

const masters = [
  ing('onion', { pantryDays: 30, packageUnits: [pkg('onion3', 3, true)] }),
  ing('carrot', { pantryDays: 30, packageUnits: [pkg('carrot3', 3, true)] }),
  ing('tofu', { unit: '丁', canFreeze: false, preppedFridgeDays: 1, packageUnits: [pkg('tofu1', 1, true)] }),
  ing('spinach', { unit: '袋', canFreeze: false, preppedFridgeDays: 2, packageUnits: [pkg('spinach1', 1, true)] }),
  ing('pork', { unit: 'g', packageUnits: [pkg('pork200', 200, true)] }),
  ing('milk', { unit: 'ml' }),
  ing('soy', { unit: 'ml', isStaple: true }),
]
const ingredients = new Map(masters.map((m) => [m.id, m]))

const recipe = (id: string, parts: [string, number | null][], over: Partial<RecRecipe> = {}): RecRecipe => ({
  id,
  title: id,
  servings: 1,
  caloriesKcal: 400,
  maxServings1_6l: 4,
  ingredients: parts.map(([ingredientId, quantity]) => ({ ingredientId, quantity })),
  ...over,
})

const ctx = (available: AvailableStock[] = []) => ({ available, ingredients, today })

describe('choosePurchase', () => {
  it('余りが最小、同じなら個数が最小', () => {
    const units = [pkg('one', 1), pkg('three', 3)]
    expect(choosePurchase(2, units)).toMatchObject({ buyQuantity: 2, units: [{ unit: { id: 'one' }, count: 2 }] })
    expect(choosePurchase(3, units)).toMatchObject({ buyQuantity: 3, units: [{ unit: { id: 'three' }, count: 1 }] })
    expect(choosePurchase(4, units).buyQuantity).toBe(4)
    expect(choosePurchase(0.5, [pkg('three', 3)]).buyQuantity).toBe(3)
  })
  it('販売単位がなければ不足量ぴったり', () => {
    expect(choosePurchase(150, [])).toEqual({ units: [], buyQuantity: 150 })
  })
})

describe('representativeQuantity', () => {
  it('代表 → 最初 → 基準単位 1 つ（g は 100）', () => {
    expect(representativeQuantity(ing('a', { packageUnits: [pkg('x', 2), pkg('y', 5, true)] }))).toBe(5)
    expect(representativeQuantity(ing('a', { packageUnits: [pkg('x', 2), pkg('y', 5)] }))).toBe(2)
    expect(representativeQuantity(ing('a', { unit: 'g' }))).toBe(100)
    expect(representativeQuantity(ing('a'))).toBe(1)
  })
})

describe('evaluate', () => {
  it('2 人前のレシピを 1 食分で入れると必要量が半分になる', () => {
    const r = recipe('nikujaga', [['pork', 400]], { servings: 2 })
    const e = evaluate([{ recipe: r, servings: 1 }], ctx())
    expect(e.shopping).toMatchObject([{ ingredientId: 'pork', needQuantity: 200, packageCount: 1, buyQuantity: 200 }])
    expect(e.leftovers).toEqual([])
  })

  it('在庫で足りる食材は買い物リストに出ない。在庫を使うとスコアが良くなる', () => {
    const r = recipe('soup', [['onion', 1]])
    const withStock = evaluate(
      [{ recipe: r, servings: 1 }],
      ctx([{ inventoryItemId: 's1', ingredientId: 'onion', quantity: 2, expiresOn: addDays(today, 20) }]),
    )
    const without = evaluate([{ recipe: r, servings: 1 }], ctx())
    expect(withStock.shopping).toEqual([])
    expect(withStock.usesInventory).toMatchObject([{ inventoryItemId: 's1', quantity: 1, isExpiringSoon: false }])
    expect(withStock.score).toBeLessThan(without.score)
  })

  it('少々・常備品は買い物にも余りにも出ない', () => {
    const r = recipe('r', [
      ['soy', 30],
      ['onion', null],
    ])
    const e = evaluate([{ recipe: r, servings: 1 }], ctx())
    expect(e.shopping).toEqual([])
    expect(e.leftovers).toEqual([])
  })

  it('販売単位がない食材は不足量ぴったりで買い、ムダは 0（0 除算にならない）', () => {
    const e = evaluate([{ recipe: recipe('r', [['milk', 150]]), servings: 1 }], ctx())
    expect(e.shopping).toMatchObject([{ ingredientId: 'milk', buyQuantity: 150, packageUnitId: null }])
    expect(e.leftovers).toEqual([])
    expect(Number.isFinite(e.score)).toBe(true)
  })

  it('冷蔵のみの食材の余りは傷みやすいとして重く数える', () => {
    const tofuHalf = evaluate([{ recipe: recipe('r', [['tofu', 0.5]]), servings: 1 }], ctx())
    const onionHalf = evaluate([{ recipe: recipe('r', [['onion', 1.5]]), servings: 1 }], ctx())
    expect(tofuHalf.leftovers).toMatchObject([{ ingredientId: 'tofu', quantity: 0.5, perishable: true }])
    expect(tofuHalf.maxPerishableLeftoverPacks).toBe(0.5)
    expect(onionHalf.leftovers[0]?.perishable).toBe(false)
  })
})

describe('recommend', () => {
  const anchor = recipe('anchor', [['onion', 1]])

  it('玉ねぎ 3 個入りしかないとき、玉ねぎを使う料理を足す案が上位に来る', () => {
    const catalog = [
      anchor,
      recipe('onionSoup', [['onion', 2]]),
      recipe('porkOnly', [['pork', 200]]),
      recipe('carrotOnly', [['carrot', 3]]),
    ]
    const result = recommend({
      anchors: [{ recipe: anchor, servings: 1 }],
      catalog,
      available: [],
      ingredients,
      today,
      options: { targetCount: 2, defaultServings: 1 },
    })
    expect(result.proposals[0]?.recipes.map((r) => r.recipeId).sort()).toEqual(['anchor', 'onionSoup'])
    expect(result.proposals[0]?.leftovers).toEqual([])
  })

  it('期限間近の在庫を使う料理が、使わない料理より上位に来る', () => {
    const catalog = [anchor, recipe('useTofu', [['tofu', 1]]), recipe('usePork', [['pork', 200]])]
    const available = [{ inventoryItemId: 't1', ingredientId: 'tofu', quantity: 1, expiresOn: addDays(today, 1) }]
    const result = recommend({
      anchors: [{ recipe: anchor, servings: 1 }],
      catalog,
      available,
      ingredients,
      today,
      options: { targetCount: 2 },
    })
    expect(result.proposals[0]?.recipes.map((r) => r.recipeId)).toContain('useTofu')
    expect(result.proposals[0]?.usesInventory).toMatchObject([{ inventoryItemId: 't1', isExpiringSoon: true }])
  })

  it('期限が先の在庫でも、それを使う案が使わない案より上位に来る', () => {
    const catalog = [anchor, recipe('useCarrot', [['carrot', 1]]), recipe('useSpinach', [['spinach', 1]])]
    const available = [{ inventoryItemId: 'c1', ingredientId: 'carrot', quantity: 1, expiresOn: addDays(today, 30) }]
    const result = recommend({
      anchors: [{ recipe: anchor, servings: 1 }],
      catalog,
      available,
      ingredients,
      today,
      options: { targetCount: 2 },
    })
    expect(result.proposals[0]?.recipes.map((r) => r.recipeId)).toContain('useCarrot')
  })

  it('確保分を引いた在庫（available に入らない量）は割り当てない', () => {
    const r = recipe('r', [['tofu', 1]])
    const result = recommend({
      anchors: [{ recipe: r, servings: 1 }],
      catalog: [r],
      available: [],
      ingredients,
      today,
      options: { targetCount: 1 },
    })
    expect(result.proposals[0]?.shopping).toMatchObject([{ ingredientId: 'tofu', buyQuantity: 1 }])
  })

  it('anchor が目標の品数以上なら探索せず 1 案だけ返す', () => {
    const catalog = ['a', 'b', 'c', 'd'].map((id) => recipe(id, [['onion', 1]]))
    const result = recommend({
      anchors: catalog.slice(0, 3).map((recipe) => ({ recipe, servings: 1 })),
      catalog,
      available: [],
      ingredients,
      today,
    })
    expect(result.proposals).toHaveLength(1)
    expect(result.proposals[0]?.recipes.every((r) => r.role === 'anchor')).toBe(true)
  })

  it('食数が 1.6L の上限を超えるレシピは提案に出ない。不明なら警告付きで出る', () => {
    const catalog = [
      anchor,
      recipe('tooBig', [['onion', 2]], { maxServings1_6l: 0.5 }),
      recipe('unknown', [['carrot', 3]], { maxServings1_6l: null }),
    ]
    const result = recommend({
      anchors: [{ recipe: anchor, servings: 1 }],
      catalog,
      available: [],
      ingredients,
      today,
      options: { targetCount: 2 },
    })
    const ids = result.proposals.flatMap((p) => p.recipes.map((r) => r.recipeId))
    expect(ids).not.toContain('tooBig')
    expect(result.proposals[0]?.warnings).toEqual(['unknown: 1.6L に収まるか未確認'])
  })

  describe('別の案（exclude）', () => {
    const catalog = [anchor, ...['a', 'b', 'c', 'd', 'e'].map((id) => recipe(id, [['onion', 1]]))]
    const run = (exclude: string[][], targetCount = 3) =>
      recommend({
        anchors: [{ recipe: anchor, servings: 1 }],
        catalog,
        available: [],
        ingredients,
        today,
        exclude,
        options: { targetCount },
      })
    const keys = (r: ReturnType<typeof recommend>) =>
      r.proposals.map((p) =>
        p.recipes
          .map((x) => x.recipeId)
          .sort()
          .join(),
      )

    it('出した組み合わせを除いた次の案を返す。順番や anchor の有無は問わない', () => {
      const first = run([])
      expect(first.proposals).toHaveLength(3)
      expect(first.hasMore).toBe(true)
      // 1 つ目は anchor 込み・逆順で、2 つ目以降は追加料理だけで渡す
      const exclude = first.proposals.map((p, i) => {
        const ids = p.recipes.map((r) => r.recipeId)
        return i === 0 ? ids.reverse() : ids.filter((id) => id !== 'anchor')
      })
      const second = run(exclude)
      expect(second.proposals.length).toBeGreaterThan(0)
      for (const k of keys(second)) expect(keys(first)).not.toContain(k)
    })

    it('出し尽くすと空で hasMore は false。AI 補完のすすめは出した案によらない', () => {
      // 候補 5 品から 2 品 = 10 通り
      const seen: string[][] = []
      const ai = run([]).aiSuggestionRecommended
      for (let round = 0; round < 10; round++) {
        const r = run(seen)
        expect(r.aiSuggestionRecommended).toBe(ai)
        if (r.proposals.length === 0) break
        for (const p of r.proposals) seen.push(p.recipes.map((x) => x.recipeId))
        if (!r.hasMore) {
          expect(seen).toHaveLength(10)
          const last = run(seen)
          expect(last.proposals).toEqual([])
          expect(last.hasMore).toBe(false)
          return
        }
      }
      throw new Error('出し尽くせなかった')
    })

    it('anchor だけの案も除ける', () => {
      const r = run([['anchor']], 1)
      expect(r.proposals).toEqual([])
      expect(r.hasMore).toBe(false)
      expect(run([], 1)).toMatchObject({ hasMore: false, proposals: [{ recipes: [{ recipeId: 'anchor' }] }] })
    })
  })

  describe('鍵で固定（fixed）', () => {
    const tofuHalf = recipe('tofuHalf', [['tofu', 0.5]])
    const catalog = [
      anchor,
      tofuHalf,
      recipe('tofuHalf2', [['tofu', 0.5]]),
      recipe('porkOnly', [['pork', 200]]),
      recipe('carrotOnly', [['carrot', 3]]),
    ]
    const run = (fixed: { recipe: RecRecipe; servings: number }[], exclude: string[][] = []) =>
      recommend({
        anchors: [{ recipe: anchor, servings: 1 }],
        catalog,
        available: [],
        ingredients,
        today,
        fixed,
        exclude,
      })

    it('固定した追加料理は必ず入り、食数はそのまま。残りは固定した料理の余りを使う組み合わせから選ぶ', () => {
      const r = run([{ recipe: tofuHalf, servings: 1 }])
      expect(r.proposals.length).toBeGreaterThan(0)
      for (const p of r.proposals) {
        expect(p.recipes).toContainEqual(expect.objectContaining({ recipeId: 'tofuHalf', role: 'added', servings: 1 }))
        expect(p.recipes).toHaveLength(3)
      }
      // 豆腐 1 丁を半分ずつ使い切る相方が一番上
      expect(r.proposals[0]?.recipes.map((x) => x.recipeId)).toContain('tofuHalf2')
    })

    it('anchor を固定するとその食数を使う', () => {
      const r = run([{ recipe: anchor, servings: 3 }])
      expect(r.proposals[0]?.recipes.find((x) => x.recipeId === 'anchor')).toMatchObject({
        role: 'anchor',
        servings: 3,
      })
    })

    it('別の案（exclude）でも固定は残り、固定した料理を含めて渡しても比べられる', () => {
      const first = run([{ recipe: tofuHalf, servings: 1 }])
      const exclude = first.proposals.map((p) => p.recipes.map((x) => x.recipeId))
      const second = run([{ recipe: tofuHalf, servings: 1 }], exclude)
      const key = (ids: string[]) => [...ids].sort().join()
      for (const p of second.proposals) {
        expect(p.recipes.map((x) => x.recipeId)).toContain('tofuHalf')
        expect(exclude.map(key)).not.toContain(key(p.recipes.map((x) => x.recipeId)))
      }
    })

    it('固定だけで品数に届いたら、その 1 案だけ', () => {
      const r = run([
        { recipe: tofuHalf, servings: 1 },
        { recipe: catalog[3] as RecRecipe, servings: 2 },
      ])
      expect(r.proposals).toHaveLength(1)
      expect(r.hasMore).toBe(false)
      expect(r.proposals[0]?.recipes.map((x) => [x.recipeId, x.servings])).toEqual(
        expect.arrayContaining([
          ['anchor', 1],
          ['tofuHalf', 1],
          ['porkOnly', 2],
        ]),
      )
    })
  })

  it('上位の案どうしで追加料理が重ならない（候補が十分あるとき）', () => {
    const catalog = [anchor, ...['a', 'b', 'c', 'd', 'e', 'f'].map((id) => recipe(id, [['onion', 1]]))]
    const result = recommend({ anchors: [{ recipe: anchor, servings: 1 }], catalog, available: [], ingredients, today })
    expect(result.proposals).toHaveLength(3)
    const added = result.proposals.flatMap((p) => p.recipes.filter((r) => r.role === 'added').map((r) => r.recipeId))
    expect(new Set(added).size).toBe(added.length)
  })

  it('候補がない、または冷蔵のみの食材が大きく余るときは AI 補完をすすめる', () => {
    const tofuHalf = recipe('tofuHalf', [['tofu', 0.5]])
    expect(
      recommend({
        anchors: [{ recipe: tofuHalf, servings: 1 }],
        catalog: [tofuHalf],
        available: [],
        ingredients,
        today,
      }).aiSuggestionRecommended,
    ).toBe(true)
    const catalog = [tofuHalf, recipe('porkOnly', [['pork', 200]])]
    const result = recommend({
      anchors: [{ recipe: tofuHalf, servings: 1 }],
      catalog,
      available: [],
      ingredients,
      today,
      options: { targetCount: 2 },
    })
    expect(result.aiSuggestionRecommended).toBe(true)
  })

  it('合計カロリーは 1 人前 × 食数。不明なレシピがあれば null', () => {
    const a = recipe('a', [['onion', 1]], { caloriesKcal: 500 })
    const b = recipe('b', [['onion', 2]], { caloriesKcal: null })
    const one = recommend({
      anchors: [{ recipe: a, servings: 2 }],
      catalog: [a],
      available: [],
      ingredients,
      today,
      options: { targetCount: 1 },
    })
    expect(one.proposals[0]?.totalCaloriesKcal).toBe(1000)
    const two = recommend({
      anchors: [
        { recipe: a, servings: 1 },
        { recipe: b, servings: 1 },
      ],
      catalog: [a, b],
      available: [],
      ingredients,
      today,
      options: { targetCount: 2 },
    })
    expect(two.proposals[0]?.totalCaloriesKcal).toBeNull()
  })
})

describe('食べる順と袋の保存場所', () => {
  it('切った後に日持ちしない料理、冷凍できない食材が多い料理を先にする。同点なら anchor が先', () => {
    const days = orderDays(
      [
        { recipe: recipe('pork', [['pork', 200]]), role: 'anchor' },
        { recipe: recipe('tofu', [['tofu', 1]]), role: 'added' },
        { recipe: recipe('spinach', [['spinach', 1]]), role: 'added' },
        { recipe: recipe('pork2', [['pork', 100]]), role: 'added' },
      ],
      ingredients,
    )
    expect([...days.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id)).toEqual([
      'tofu',
      'spinach',
      'pork',
      'pork2',
    ])
  })

  it('食べる日が切った後の冷蔵日持ちより先なら冷凍', () => {
    const tofu = recipe('tofu', [['tofu', 1]])
    expect(kitLocation(tofu, 1, ingredients)).toBe('fridge')
    expect(kitLocation(tofu, 2, ingredients)).toBe('fridge')
    expect(kitLocation(tofu, 3, ingredients)).toBe('freezer')
    expect(kitLocation(recipe('pork', [['pork', 200]]), 3, ingredients)).toBe('fridge')
    expect(kitLocation(recipe('pork', [['pork', 200]]), 4, ingredients)).toBe('freezer')
  })
})

describe('evaluatePlan', () => {
  it('決めた食べる順のまま袋の場所を出し、食数で買う量が変わる', () => {
    const tofuSoup = recipe('tofuSoup', [['tofu', 1]])
    const curry = recipe('curry', [['pork', 200]])
    const items = [
      { recipe: curry, servings: 1, role: 'anchor' as const, dayIndex: 1 },
      { recipe: tofuSoup, servings: 1, role: 'added' as const, dayIndex: 3 },
    ]
    const p = evaluatePlan({ items, available: [], ingredients, today })
    expect(p.recipes.map((r) => [r.recipeId, r.dayIndex])).toEqual([
      ['curry', 1],
      ['tofuSoup', 3],
    ])
    // 豆腐は切った後 1 日しか持たないので 3 日目は冷凍
    expect(p.kitLocations).toEqual([
      { recipeId: 'curry', location: 'fridge' },
      { recipeId: 'tofuSoup', location: 'freezer' },
    ])
    const doubled = evaluatePlan({
      items: items.map((i) => (i.recipe.id === 'curry' ? { ...i, servings: 2 } : i)),
      available: [],
      ingredients,
      today,
    })
    expect(doubled.shopping.find((s) => s.ingredientId === 'pork')?.packageCount).toBe(2)
    expect(doubled.totalCaloriesKcal).toBe(1200)
  })
})
