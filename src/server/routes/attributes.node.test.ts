import { beforeEach, describe, expect, it } from 'vitest'
import type { EstimateAttributesResponse } from '../../shared/schemas/attributes'
import type { Ingredient, IngredientInput } from '../../shared/schemas/ingredient'
import type { Recipe, RecipeInput } from '../../shared/schemas/recipe'
import { createTestApi } from '../testing/app'

const base = {
  canFreeze: true,
  fridgeDays: 3,
  freezerDays: 30,
  defaultLocation: 'fridge',
} satisfies Partial<IngredientInput>

let api: ReturnType<typeof createTestApi>

async function addIngredient(name: string, category: IngredientInput['category'], unit = 'g', gramsPerUnit?: number) {
  const res = await api.call<Ingredient>('POST', '/ingredients', { ...base, name, category, unit, gramsPerUnit })
  expect(res.status).toBe(201)
  return res.body
}

async function addRecipe(
  title: string,
  parts: { ingredient: Ingredient; quantity: number }[],
  extra: Partial<RecipeInput> = {},
) {
  const res = await api.call<Recipe>('POST', '/recipes', {
    title,
    servings: 2,
    ingredients: parts.map((p) => ({
      ingredientId: p.ingredient.id,
      quantity: p.quantity,
      displayText: `${p.ingredient.name} ${p.quantity}`,
    })),
    ...extra,
  } satisfies RecipeInput)
  expect(res.status).toBe(201)
  return res.body
}

/** 取り込みのまま（attributes_source が NULL）に戻す。画面や API から作ると rule・manual になるため */
function resetSources() {
  api.sqlite.exec('UPDATE ingredients SET attributes_source = NULL')
  api.sqlite.exec(
    'UPDATE recipes SET attributes_source = NULL, dish_type = NULL, cuisine = NULL, uses_mixing_unit = NULL, cook_minutes = NULL',
  )
}

const estimate = (limit?: number) =>
  api.call<EstimateAttributesResponse>('POST', '/recipes/attributes/estimate', limit ? { limit } : {})
const ingredient = async (id: string) => (await api.call<Ingredient>('GET', `/ingredients/${id}`)).body
const recipe = async (id: string) => (await api.call<Recipe>('GET', `/recipes/${id}`)).body

beforeEach(() => {
  api = createTestApi()
})

describe('POST /api/recipes/attributes/estimate: 食材', () => {
  it('vegetable に混ざった食材を名前で直し、名前で決まらないものと重さのないものを AI に聞く', async () => {
    const saba = await addIngredient('さば（切り身）', 'vegetable')
    const sugar = await addIngredient('砂糖', 'vegetable')
    const onion = await addIngredient('玉ねぎ', 'vegetable', '個', 200)
    const mystery = await addIngredient('謎の食材', 'vegetable', '個')
    const pork = await addIngredient('豚こま切れ肉', 'meat')
    resetSources()

    const res = await estimate()
    expect(res.status).toBe(200)
    expect(res.body.ingredients).toEqual({ updated: 5, remaining: 0 })
    expect(await ingredient(saba.id)).toMatchObject({ category: 'fish', attributesSource: 'rule' })
    expect(await ingredient(sugar.id)).toMatchObject({ category: 'seasoning', attributesSource: 'rule' })
    expect(await ingredient(onion.id)).toMatchObject({ category: 'vegetable', attributesSource: 'rule' })
    expect(await ingredient(pork.id)).toMatchObject({ category: 'meat', attributesSource: 'rule' })
    // テスト用の AI は「肉」を含まなければ other、重さは 100g
    expect(await ingredient(mystery.id)).toMatchObject({ category: 'other', gramsPerUnit: 100, attributesSource: 'ai' })
  })

  it('名前で分類が決まっても、重さがなければ重さだけ AI に聞く', async () => {
    const egg = await addIngredient('卵', 'vegetable', '個')
    resetSources()
    await estimate()
    expect(await ingredient(egg.id)).toMatchObject({
      category: 'tofu_egg_dairy',
      gramsPerUnit: 100,
      attributesSource: 'ai',
    })
    // 名前で野菜と決まったものも、AI の分類（テスト用の AI は other）で変えない
    const carrot = await addIngredient('にんじん', 'vegetable', '本')
    resetSources()
    await estimate()
    expect(await ingredient(carrot.id)).toMatchObject({ category: 'vegetable', gramsPerUnit: 100 })
  })

  it('画面で分類を直した食材（manual）は変えない', async () => {
    const x = await addIngredient('謎の食材', 'vegetable', 'g')
    resetSources()
    const edited = await api.call<Ingredient>('PUT', `/ingredients/${x.id}`, {
      ...base,
      name: '謎の食材',
      category: 'dry',
      unit: 'g',
    })
    expect(edited.body.attributesSource).toBe('manual')
    await estimate()
    expect(await ingredient(x.id)).toMatchObject({ category: 'dry', attributesSource: 'manual' })
  })

  it('AI に聞く分は limit 件ずつ。食材が残っているあいだはレシピを AI に聞かない', async () => {
    const a = await addIngredient('謎A', 'vegetable')
    await addIngredient('謎B', 'vegetable')
    const r = await addRecipe('謎の料理', [{ ingredient: a, quantity: 100 }])
    resetSources()

    const first = await estimate(1)
    expect(first.body.ingredients).toEqual({ updated: 1, remaining: 1 })
    expect(first.body.recipes.remaining).toBe(1)
    expect((await recipe(r.id)).attributesSource).toBe('rule')

    // 食材が済むと価格の段を AI で進める。価格が残っているあいだもレシピは AI に聞かない
    const second = await estimate(1)
    expect(second.body.ingredients).toEqual({ updated: 1, remaining: 0 })
    expect(second.body.prices).toEqual({ updated: 1, remaining: 1 })
    expect(second.body.recipes.remaining).toBe(1)

    const third = await estimate(1)
    expect(third.body.prices).toEqual({ updated: 1, remaining: 0 })
    expect(third.body.recipes).toEqual({ updated: 1, remaining: 0 })
    expect((await recipe(r.id)).attributesSource).toBe('ai')

    const fourth = await estimate(1)
    expect(fourth.body).toEqual({
      ingredients: { updated: 0, remaining: 0 },
      storage: { updated: 0, remaining: 0 },
      prices: { updated: 0, remaining: 0 },
      recipes: { updated: 0, remaining: 0 },
    })
  })
})

describe('POST /api/recipes/attributes/estimate: レシピ', () => {
  let pork: Ingredient
  let spinach: Ingredient
  beforeEach(async () => {
    pork = await addIngredient('豚こま切れ肉', 'meat')
    spinach = await addIngredient('ほうれん草', 'vegetable')
  })

  it('ルールで決め、決まらなかった欄だけ AI に聞く（ルールの値は残す）', async () => {
    const nikujaga = await addRecipe('肉じゃが', [{ ingredient: pork, quantity: 200 }], {
      hotcookMode: '手動 > 煮物を作る > まぜる > 25分',
    })
    const mystery = await addRecipe('ほうれん草のなにか', [{ ingredient: spinach, quantity: 200 }])
    resetSources()

    const res = await estimate()
    // ルールで 2 件、AI で 1 件
    expect(res.body.recipes).toEqual({ updated: 3, remaining: 0 })
    expect(await recipe(nikujaga.id)).toMatchObject({
      dishType: 'main',
      cuisine: 'japanese',
      usesMixingUnit: true,
      cookMinutes: 35,
      attributesSource: 'rule',
    })
    // 区分はルール（副菜）、系統だけ AI（テスト用の AI は和）
    expect(await recipe(mystery.id)).toMatchObject({ dishType: 'side', cuisine: 'japanese', attributesSource: 'ai' })
  })

  it('手で直したレシピは変えない', async () => {
    const r = await addRecipe('ほうれん草のなにか', [{ ingredient: spinach, quantity: 200 }])
    await api.call('PUT', `/recipes/${r.id}`, {
      title: 'ほうれん草のなにか',
      servings: 2,
      ingredients: [{ ingredientId: spinach.id, quantity: 200, displayText: 'ほうれん草 200g' }],
      dishType: 'main',
      cuisine: null,
      attributesManual: true,
    } satisfies RecipeInput)
    await estimate()
    expect(await recipe(r.id)).toMatchObject({ dishType: 'main', cuisine: null, attributesSource: 'manual' })
  })

  it('AI がいらなければ、AI の設定がなくても動く', async () => {
    api = createTestApi({ env: { AI_PROVIDER: 'gemini' } })
    const meat = await addIngredient('豚こま切れ肉', 'meat')
    await addRecipe('肉じゃが', [{ ingredient: meat, quantity: 200 }])
    resetSources()
    const res = await estimate()
    expect(res.status).toBe(200)
    expect(res.body.recipes.remaining).toBe(0)
  })

  it('AI が要るのに設定がなければ 503', async () => {
    api = createTestApi({ env: { AI_PROVIDER: 'gemini' } })
    await addIngredient('謎の食材', 'vegetable')
    resetSources()
    expect((await estimate()).status).toBe(503)
  })
})

describe('POST /api/recipes/attributes/estimate: 価格', () => {
  const estimateWith = (body: Record<string, unknown>) =>
    api.call<EstimateAttributesResponse>('POST', '/recipes/attributes/estimate', body)

  it('辞書で決まる食材は AI なしで default、決まらない食材は AI に聞く。代表量あたりで入れる', async () => {
    const pork = await addIngredient('豚こま切れ肉', 'meat')
    const onion = await api.call<Ingredient>('POST', '/ingredients', {
      ...base,
      name: '玉ねぎ',
      category: 'vegetable',
      unit: '個',
      gramsPerUnit: 200,
      packageUnits: [{ label: '3個入り', quantity: 3, isDefault: true }],
    })
    const mystery = await addIngredient('謎の食材', 'other', '個', 50)
    const res = await estimate()
    expect(res.body.prices).toEqual({ updated: 3, remaining: 0 })
    // 豚こまは 100g 150 円、代表量は 100g
    expect(await ingredient(pork.id)).toMatchObject({ priceYen: 150, priceSource: 'default' })
    // 玉ねぎは 1 個 50 円、代表は 3個入り
    expect(await ingredient(onion.body.id)).toMatchObject({ priceYen: 150, priceSource: 'default' })
    // テスト用の AI は 100 円
    expect(await ingredient(mystery.id)).toMatchObject({ priceYen: 100, priceSource: 'default' })
    expect((await ingredient(mystery.id)).priceUpdatedAt).not.toBeNull()
  })

  it('手で入れた価格・常備品・価格のある食材は変えない', async () => {
    const pork = await addIngredient('豚こま切れ肉', 'meat')
    await api.call('PUT', `/ingredients/${pork.id}`, {
      ...base,
      name: '豚こま切れ肉',
      category: 'meat',
      unit: 'g',
      priceYen: 999,
    })
    const salt = await api.call<Ingredient>('POST', '/ingredients', {
      ...base,
      name: '塩',
      category: 'seasoning',
      unit: 'g',
      isStaple: true,
    })
    const res = await estimate()
    expect(res.body.prices).toEqual({ updated: 0, remaining: 0 })
    expect(await ingredient(pork.id)).toMatchObject({ priceYen: 999, priceSource: 'manual' })
    expect(await ingredient(salt.body.id)).toMatchObject({ priceYen: null, priceSource: null })
  })

  it('AI が答えない・範囲外の価格は未設定のまま印を付け、次からは聞かない', async () => {
    const luxury = await addIngredient('高級な謎の食材', 'other', '個', 50)
    const first = await estimate()
    expect(first.body.prices).toEqual({ updated: 1, remaining: 0 })
    expect(await ingredient(luxury.id)).toMatchObject({ priceYen: null, priceSource: null })
    const row = api.sqlite.prepare('SELECT price_updated_at FROM ingredients WHERE id = ?').get(luxury.id) as {
      price_updated_at: string | null
    }
    expect(row.price_updated_at).not.toBeNull()
    expect((await estimate()).body.prices).toEqual({ updated: 0, remaining: 0 })
  })

  it('limit 件ずつ AI に聞き、残りを remaining で返す。食材の段の AI が残っていれば価格は AI に聞かない', async () => {
    for (const n of ['謎A', '謎B', '謎C']) await addIngredient(n, 'vegetable', '個')
    resetSources()
    const first = await estimate(2)
    // 食材の段で 2 件聞いたので、価格の段は数えるだけ
    expect(first.body.ingredients).toEqual({ updated: 2, remaining: 1 })
    expect(first.body.prices).toEqual({ updated: 0, remaining: 3 })
    const second = await estimate(2)
    expect(second.body.ingredients).toEqual({ updated: 1, remaining: 0 })
    expect(second.body.prices).toEqual({ updated: 2, remaining: 1 })
    expect((await estimate(2)).body.prices).toEqual({ updated: 1, remaining: 0 })
  })

  it('refreshStalePrices: 1 年より前の目安だけ未設定に戻して推定し直す。手入力は残す', async () => {
    const pork = await addIngredient('豚こま切れ肉', 'meat')
    const beef = await addIngredient('牛こま切れ肉', 'meat')
    const chicken = await addIngredient('鶏もも肉', 'meat')
    api.sqlite.exec(
      `UPDATE ingredients SET price_yen = 1, price_source = 'default', price_updated_at = '2020-01-01T00:00:00.000Z' WHERE id = '${pork.id}'`,
    )
    api.sqlite.exec(
      `UPDATE ingredients SET price_yen = 2, price_source = 'manual', price_updated_at = '2020-01-01T00:00:00.000Z' WHERE id = '${beef.id}'`,
    )
    api.sqlite.exec(
      `UPDATE ingredients SET price_yen = 3, price_source = 'default', price_updated_at = '${new Date().toISOString()}' WHERE id = '${chicken.id}'`,
    )
    // 付けなければ古くても触らない
    await estimateWith({})
    expect((await ingredient(pork.id)).priceYen).toBe(1)

    const res = await estimateWith({ refreshStalePrices: true })
    expect(res.body.prices).toEqual({ updated: 1, remaining: 0 })
    expect(await ingredient(pork.id)).toMatchObject({ priceYen: 150, priceSource: 'default' })
    expect(await ingredient(beef.id)).toMatchObject({ priceYen: 2, priceSource: 'manual' })
    expect(await ingredient(chicken.id)).toMatchObject({ priceYen: 3, priceSource: 'default' })
  })
})

describe('POST /api/recipes/attributes/estimate: 日持ち', () => {
  /** 取り込みのまま（分類ごとの固定値）に戻す。画面や API から作ると manual になるため */
  const resetStorage = () =>
    api.sqlite.exec(
      "UPDATE ingredients SET storage_source = NULL, can_freeze = 1, fridge_days = 7, freezer_days = 30, pantry_days = NULL, default_location = 'fridge'",
    )
  const storageSource = (id: string) =>
    (
      api.sqlite.prepare('SELECT storage_source FROM ingredients WHERE id = ?').get(id) as {
        storage_source: string | null
      }
    ).storage_source

  it('画面から登録した食材は手入力。日持ちを直すと手入力になる', async () => {
    const sugar = await addIngredient('グラニュー糖', 'seasoning')
    expect(storageSource(sugar.id)).toBe('manual')
    api.sqlite.exec(`UPDATE ingredients SET storage_source = 'rule' WHERE id = '${sugar.id}'`)
    // 日持ちを変えずに保存しても rule のまま
    await api.call('PUT', `/ingredients/${sugar.id}`, {
      ...base,
      name: 'グラニュー糖',
      category: 'seasoning',
      unit: 'g',
    })
    expect(storageSource(sugar.id)).toBe('rule')
    await api.call('PUT', `/ingredients/${sugar.id}`, {
      ...base,
      name: 'グラニュー糖',
      category: 'seasoning',
      unit: 'g',
      fridgeDays: 100,
    })
    expect(storageSource(sugar.id)).toBe('manual')
  })

  it('分類だけを変えたら、手入力でない日持ちは未見直しに戻り、次の推定で新しい分類で入れ直す', async () => {
    const katsuo = await addIngredient('かつおぶし', 'vegetable')
    api.sqlite.exec(`UPDATE ingredients SET storage_source = 'rule' WHERE id = '${katsuo.id}'`)
    const res = await api.call<Ingredient>('PUT', `/ingredients/${katsuo.id}`, {
      ...base,
      name: 'かつおぶし',
      category: 'dry',
      unit: 'g',
    })
    expect(res.status).toBe(200)
    // 前の分類の値はいったん残るが、未見直しになる
    expect(res.body).toMatchObject({ category: 'dry', fridgeDays: 3, storageSource: null })
    expect((await estimate()).body.storage).toEqual({ updated: 1, remaining: 0 })
    expect(await ingredient(katsuo.id)).toMatchObject({
      defaultLocation: 'pantry',
      pantryDays: 180,
      storageSource: 'rule',
    })
  })

  it('ai の日持ちも分類を変えたら未見直しに戻す。分類を変えなければそのまま', async () => {
    const x = await addIngredient('謎の食材', 'vegetable', '個', 100)
    api.sqlite.exec(`UPDATE ingredients SET storage_source = 'ai' WHERE id = '${x.id}'`)
    const put = (category: IngredientInput['category']) =>
      api.call('PUT', `/ingredients/${x.id}`, { ...base, name: '謎の食材', category, unit: '個', gramsPerUnit: 100 })
    await put('vegetable')
    expect(storageSource(x.id)).toBe('ai')
    await put('other')
    expect(storageSource(x.id)).toBe(null)
  })

  it('手で入れた日持ちは、分類を変えても残す', async () => {
    const pickles = await addIngredient('自家製ピクルス', 'vegetable')
    expect(storageSource(pickles.id)).toBe('manual')
    await api.call('PUT', `/ingredients/${pickles.id}`, {
      ...base,
      name: '自家製ピクルス',
      category: 'other',
      unit: 'g',
    })
    expect(await ingredient(pickles.id)).toMatchObject({ category: 'other', fridgeDays: 3, storageSource: 'manual' })
    expect((await estimate()).body.storage).toEqual({ updated: 0, remaining: 0 })
    expect((await ingredient(pickles.id)).fridgeDays).toBe(3)
  })

  it('分類と日持ちを一緒に変えたら、手入力になる', async () => {
    const x = await addIngredient('謎の食材', 'vegetable')
    api.sqlite.exec(`UPDATE ingredients SET storage_source = 'rule' WHERE id = '${x.id}'`)
    await api.call('PUT', `/ingredients/${x.id}`, {
      ...base,
      name: '謎の食材',
      category: 'other',
      unit: 'g',
      fridgeDays: 10,
    })
    expect(await ingredient(x.id)).toMatchObject({ category: 'other', fridgeDays: 10, storageSource: 'manual' })
  })

  it('取り込みのままの食材を辞書で入れ直し、決まらないものを AI に聞く。手入力は変えない', async () => {
    const sugar = await addIngredient('グラニュー糖', 'seasoning')
    const katsuo = await addIngredient('かつおぶし', 'dry')
    const mystery = await addIngredient('謎の野菜', 'vegetable', '個', 100)
    const mine = await addIngredient('自家製ピクルス', 'other')
    resetStorage()
    api.sqlite.exec(`UPDATE ingredients SET storage_source = 'manual', fridge_days = 20 WHERE id = '${mine.id}'`)

    const res = await estimate()
    expect(res.body.storage).toEqual({ updated: 3, remaining: 0 })
    expect(await ingredient(sugar.id)).toMatchObject({
      canFreeze: false,
      freezerDays: null,
      defaultLocation: 'pantry',
      storageSource: 'rule',
    })
    expect((await ingredient(sugar.id)).pantryDays).toBeGreaterThanOrEqual(365)
    expect(await ingredient(katsuo.id)).toMatchObject({
      defaultLocation: 'pantry',
      pantryDays: 180,
      storageSource: 'rule',
    })
    // テスト用の AI は冷蔵 4 日・冷凍 30 日
    expect(await ingredient(mystery.id)).toMatchObject({ fridgeDays: 4, freezerDays: 30, storageSource: 'ai' })
    expect(await ingredient(mine.id)).toMatchObject({ fridgeDays: 20, storageSource: 'manual' })
  })

  it('AI の答えが範囲外・答えなしなら今の値を残し、次からは聞かない', async () => {
    const bad = await addIngredient('日持ちしない謎の野菜', 'vegetable', '個', 100)
    const none = await addIngredient('高級な謎の野菜', 'vegetable', '個', 100)
    resetStorage()
    expect((await estimate()).body.storage).toEqual({ updated: 2, remaining: 0 })
    expect(await ingredient(bad.id)).toMatchObject({ fridgeDays: 7, freezerDays: 30, storageSource: 'ai' })
    expect(await ingredient(none.id)).toMatchObject({ fridgeDays: 7, storageSource: 'ai' })
    expect((await estimate()).body.storage).toEqual({ updated: 0, remaining: 0 })
  })

  it('分類の段の AI が残っているあいだは、その食材の日持ちを決めない。価格とレシピも AI に聞かない', async () => {
    const a = await addIngredient('謎A', 'vegetable')
    const b = await addIngredient('謎B', 'vegetable')
    resetSources()
    resetStorage()
    const first = await estimate(1)
    expect(first.body.ingredients).toEqual({ updated: 1, remaining: 1 })
    // 1 件は分類が決まったが、日持ちの段は AI を使わないので残り 2 件
    expect(first.body.storage).toEqual({ updated: 0, remaining: 2 })
    expect(first.body.prices.updated).toBe(0)
    const second = await estimate(1)
    expect(second.body.ingredients.remaining).toBe(0)
    expect(second.body.storage).toEqual({ updated: 1, remaining: 1 })
    const third = await estimate(1)
    expect(third.body.storage).toEqual({ updated: 1, remaining: 0 })
    expect((await ingredient(a.id)).storageSource).toBe('ai')
    expect((await ingredient(b.id)).storageSource).toBe('ai')
  })
})
