import { describe, expect, it } from 'vitest'
import { buildKit, consumeStock, defaultKitLocation, type PrepIngredient, type PrepRecipe, summarizePrep } from './prep'

const packedOn = '2026-11-27'

const ing = (id: string, over: Partial<PrepIngredient> = {}): PrepIngredient => ({
  id,
  name: id,
  unit: '個',
  category: 'vegetable',
  isStaple: false,
  canFreeze: true,
  preppedFridgeDays: null,
  preppedFreezerDays: null,
  beforeCookTask: null,
  ...over,
})

const masters = [
  ing('onion', { name: '玉ねぎ', preppedFridgeDays: 3, preppedFreezerDays: 30 }),
  ing('potato', { name: 'じゃがいも', canFreeze: false, preppedFridgeDays: 1 }),
  ing('tofu', { name: '豆腐', unit: '丁', category: 'tofu_egg_dairy', beforeCookTask: '2cm角に切る' }),
  ing('pork', { name: '豚こま', unit: 'g', category: 'meat', preppedFridgeDays: 2, preppedFreezerDays: 21 }),
  ing('soy', { name: 'しょうゆ', unit: 'ml', category: 'seasoning', isStaple: true }),
  ing('mirin', { name: 'みりん', unit: 'ml', category: 'seasoning' }),
]
const ingredients = new Map(masters.map((m) => [m.id, m]))

const recipe = (over: Partial<PrepRecipe> = {}): PrepRecipe => ({
  recipeId: 'nikujaga',
  title: '肉じゃが',
  recipeServings: 2,
  servings: 1,
  plannedOn: '2026-11-28',
  packSeasonings: false,
  ingredients: [
    { ingredientId: 'onion', quantity: 1, cutStyle: 'くし形切り', displayText: '玉ねぎ 1個' },
    { ingredientId: 'potato', quantity: 2, cutStyle: '乱切り', displayText: 'じゃがいも 2個' },
    { ingredientId: 'pork', quantity: 200, cutStyle: null, displayText: '豚こま 200g' },
    { ingredientId: 'soy', quantity: 30, cutStyle: null, displayText: 'しょうゆ 大さじ2' },
    { ingredientId: 'mirin', quantity: null, cutStyle: null, displayText: 'みりん 少々' },
  ],
  ...over,
})

describe('袋の保存場所', () => {
  it('食べる日まで、切った後の冷蔵日持ち（最小値）以内なら冷蔵、超えたら冷凍', () => {
    // じゃがいもは切った後 1 日
    expect(defaultKitLocation(recipe({ plannedOn: '2026-11-28' }), ingredients, packedOn)).toBe('fridge')
    expect(defaultKitLocation(recipe({ plannedOn: '2026-11-29' }), ingredients, packedOn)).toBe('freezer')
  })

  it('直前作業が決まっている食材と調味料は日持ちの計算に入れない', () => {
    const r = recipe({
      plannedOn: '2026-11-29',
      ingredients: [
        { ingredientId: 'pork', quantity: 200, cutStyle: null, displayText: '' },
        { ingredientId: 'tofu', quantity: 1, cutStyle: null, displayText: '' },
      ],
    })
    expect(defaultKitLocation(r, ingredients, packedOn)).toBe('fridge')
  })
})

describe('buildKit', () => {
  it('冷蔵: 食数でスケールし、調味料は袋に入れない。使用期限は袋に入る食材の最小', () => {
    const kit = buildKit(recipe(), ingredients, packedOn)
    expect(kit.location).toBe('fridge')
    expect(kit.items.map((i) => [i.ingredientId, i.state, i.quantity])).toEqual([
      ['onion', 'packed', 0.5],
      ['potato', 'packed', 1],
      ['pork', 'packed', 100],
    ])
    expect(kit.useBy).toBe('2026-11-28')
    expect(kit.warnings).toEqual([])
  })

  it('冷凍: 冷凍できない食材は直前に切る。マスタの直前作業はいつも残す', () => {
    const r = recipe({
      plannedOn: '2026-11-30',
      ingredients: [...recipe().ingredients, { ingredientId: 'tofu', quantity: 1, cutStyle: null, displayText: '' }],
    })
    const kit = buildKit(r, ingredients, packedOn)
    expect(kit.location).toBe('freezer')
    expect(kit.items.filter((i) => i.state === 'before_cook').map((i) => [i.ingredientId, i.beforeCookTask])).toEqual([
      ['potato', '冷凍できないので直前に切る（乱切り）'],
      ['tofu', '2cm角に切る'],
    ])
    // 冷凍の期限: 玉ねぎ 30 日、豚 21 日 → 21 日
    expect(kit.useBy).toBe('2026-12-18')
  })

  it('下味冷凍のレシピは調味料も袋へ。常備品と量のないものは在庫を動かさない', () => {
    const kit = buildKit(recipe({ packSeasonings: true }), ingredients, packedOn)
    const seasonings = kit.items.filter((i) => i.state === 'seasoning_packed')
    expect(seasonings.map((i) => [i.ingredientId, i.quantity, i.tracked])).toEqual([
      ['soy', 15, false],
      ['mirin', null, false],
    ])
  })

  it('冷蔵にして使用期限が食べる日より前なら注意', () => {
    const kit = buildKit(recipe({ plannedOn: '2026-11-30' }), ingredients, packedOn, 'fridge')
    expect(kit.location).toBe('fridge')
    expect(kit.defaultLocation).toBe('freezer')
    expect(kit.warnings).toEqual(['冷蔵だと使用期限（11/28）が食べる日より前です'])
  })
})

describe('summarizePrep', () => {
  it('今切るものを食材ごとにまとめ、売り場順（肉は後）。切らないものは別枠', () => {
    const curry: PrepRecipe = {
      ...recipe(),
      recipeId: 'curry',
      title: 'カレー',
      recipeServings: 1,
      plannedOn: '2026-11-30',
      ingredients: [
        { ingredientId: 'pork', quantity: 150, cutStyle: '一口大', displayText: '' },
        { ingredientId: 'onion', quantity: 1, cutStyle: '薄切り', displayText: '' },
        { ingredientId: 'potato', quantity: 1, cutStyle: '乱切り', displayText: '' },
      ],
    }
    const kits = [buildKit(recipe(), ingredients, packedOn), buildKit(curry, ingredients, packedOn)]
    const s = summarizePrep(kits)
    expect(s.cutNow.map((c) => [c.name, c.totalQuantity, c.uses.map((u) => u.cutStyle)])).toEqual([
      ['じゃがいも', 1, ['乱切り']],
      ['玉ねぎ', 1.5, ['くし形切り', '薄切り']],
      ['豚こま', 150, ['一口大']],
    ])
    expect(s.keepWhole).toMatchObject([{ name: 'じゃがいも', recipeTitle: 'カレー', location: 'freezer' }])
    expect(s.asIs).toMatchObject([{ name: '豚こま', quantity: 100, recipeTitle: '肉じゃが' }])
  })
})

describe('consumeStock', () => {
  it('期限の近い行から減らし、足りない分を返す', () => {
    const rows = [
      { id: 'b', ingredientId: 'pork', quantity: 200, expiresOn: '2026-11-30' },
      { id: 'a', ingredientId: 'pork', quantity: 100, expiresOn: '2026-11-28' },
      { id: 'c', ingredientId: 'onion', quantity: 1, expiresOn: '2026-12-10' },
    ]
    const r = consumeStock(rows, [
      { ingredientId: 'pork', quantity: 150 },
      { ingredientId: 'onion', quantity: 1.5 },
    ])
    expect(r.updates).toEqual([
      { id: 'a', quantity: 0 },
      { id: 'b', quantity: 150 },
      { id: 'c', quantity: 0 },
    ])
    expect(r.shortages).toEqual(new Map([['onion', 0.5]]))
  })
})
