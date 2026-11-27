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

    const second = await estimate(1)
    expect(second.body.ingredients).toEqual({ updated: 1, remaining: 0 })
    expect(second.body.recipes).toEqual({ updated: 1, remaining: 0 })
    expect((await recipe(r.id)).attributesSource).toBe('ai')

    const third = await estimate(1)
    expect(third.body).toEqual({ ingredients: { updated: 0, remaining: 0 }, recipes: { updated: 0, remaining: 0 } })
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
