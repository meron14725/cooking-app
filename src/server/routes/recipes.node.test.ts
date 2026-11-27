import { beforeEach, describe, expect, it } from 'vitest'
import type { Ingredient, IngredientInput } from '../../shared/schemas/ingredient'
import type { Recipe, RecipeInput, RecipeSummary } from '../../shared/schemas/recipe'
import { createTestApi } from '../testing/app'

const base = {
  canFreeze: true,
  fridgeDays: 3,
  freezerDays: 30,
  defaultLocation: 'fridge',
} satisfies Partial<IngredientInput>

let api: ReturnType<typeof createTestApi>
let onion: Ingredient
let pork: Ingredient

function curry(overrides: Partial<RecipeInput> = {}): RecipeInput {
  return {
    title: '豚肉と玉ねぎの煮物',
    servings: 2,
    caloriesKcal: 450,
    hotcookMode: '煮物 > 肉じゃが',
    maxServings1_6l: 4,
    ingredients: [
      { ingredientId: onion.id, quantity: 1, displayText: '玉ねぎ 1個', cutStyle: 'くし形切り', addOrder: 1 },
      { ingredientId: pork.id, quantity: 200, displayText: '豚こま 200g', addOrder: 2 },
    ],
    steps: [
      { phase: 'prep', text: '玉ねぎをくし形に切る' },
      { phase: 'cook', text: '内鍋に玉ねぎ、豚肉の順に入れる' },
    ],
    ...overrides,
  }
}

beforeEach(async () => {
  api = createTestApi()
  onion = (
    await api.call<Ingredient>('POST', '/ingredients', {
      ...base,
      name: '玉ねぎ',
      category: 'vegetable',
      unit: '個',
      gramsPerUnit: 200,
    })
  ).body
  pork = (
    await api.call<Ingredient>('POST', '/ingredients', { ...base, name: '豚こま切れ肉', category: 'meat', unit: 'g' })
  ).body
})

describe('レシピ API', () => {
  it('作成して取得できる。材料と手順は送った順', async () => {
    const created = await api.call<Recipe>('POST', '/recipes', curry())
    expect(created.status).toBe(201)
    expect(created.body.sourceType).toBe('manual')
    expect(created.body.ingredients.map((i) => [i.ingredientName, i.unit, i.quantity])).toEqual([
      ['玉ねぎ', '個', 1],
      ['豚こま切れ肉', 'g', 200],
    ])
    expect(created.body.steps.map((s) => [s.stepNo, s.phase])).toEqual([
      [1, 'prep'],
      [2, 'cook'],
    ])
    const got = await api.call<Recipe>('GET', `/recipes/${created.body.id}`)
    expect(got.body).toEqual(created.body)
  })

  it('API からは作成元 seed で作れない', async () => {
    expect((await api.call('POST', '/recipes', curry({ sourceType: 'seed' as never }))).status).toBe(400)
  })

  it('材料が空、または人数が 0 だと 400', async () => {
    expect((await api.call('POST', '/recipes', curry({ ingredients: [] }))).status).toBe(400)
    expect((await api.call('POST', '/recipes', curry({ servings: 0 }))).status).toBe(400)
  })

  it('マスタにない食材や削除済みの食材は 400', async () => {
    const unknown = await api.call<{ error: { code: string } }>(
      'POST',
      '/recipes',
      curry({ ingredients: [{ ingredientId: 'nope', quantity: 1, displayText: 'なにか' }] }),
    )
    expect(unknown.status).toBe(400)
    expect(unknown.body.error.code).toBe('UNKNOWN_INGREDIENT')

    await api.call('DELETE', `/ingredients/${onion.id}`)
    expect((await api.call('POST', '/recipes', curry())).status).toBe(400)
  })

  it('材料の食材があとで削除されても、そのレシピは取得・更新できる', async () => {
    const { body: created } = await api.call<Recipe>('POST', '/recipes', curry())
    await api.call('DELETE', `/ingredients/${onion.id}`)
    expect((await api.call<Recipe>('GET', `/recipes/${created.id}`)).body.ingredients).toHaveLength(2)
    const res = await api.call<Recipe>('PUT', `/recipes/${created.id}`, curry({ title: '煮物' }))
    expect(res.status).toBe(200)
  })

  it('量 null（少々・適量）を保存できる', async () => {
    const { body } = await api.call<Recipe>(
      'POST',
      '/recipes',
      curry({ ingredients: [{ ingredientId: onion.id, quantity: null, displayText: '玉ねぎ 適量' }] }),
    )
    expect(body.ingredients[0]?.quantity).toBeNull()
  })

  it('更新は材料と手順を丸ごと置き換え、作成元は変えない', async () => {
    const { body: created } = await api.call<Recipe>('POST', '/recipes', curry({ sourceType: 'url' }))
    const res = await api.call<Recipe>(
      'PUT',
      `/recipes/${created.id}`,
      curry({
        title: '玉ねぎだけ煮',
        sourceType: 'manual',
        ingredients: [{ ingredientId: onion.id, quantity: 2, displayText: '玉ねぎ 2個' }],
        steps: [],
      }),
    )
    expect(res.status).toBe(200)
    expect(res.body.title).toBe('玉ねぎだけ煮')
    expect(res.body.sourceType).toBe('url')
    expect(res.body.ingredients.map((i) => i.quantity)).toEqual([2])
    expect(res.body.steps).toEqual([])
  })

  it('一覧はタイトル検索と食材で絞り込める。材料の食材名が付く', async () => {
    await api.call('POST', '/recipes', curry())
    await api.call(
      'POST',
      '/recipes',
      curry({ title: 'オニオンスープ', ingredients: [{ ingredientId: onion.id, quantity: 1, displayText: '玉ねぎ' }] }),
    )
    const all = await api.call<{ items: RecipeSummary[] }>('GET', '/recipes')
    expect(all.body.items.map((r) => r.title)).toEqual(['オニオンスープ', '豚肉と玉ねぎの煮物'])
    expect(all.body.items[1]?.ingredientNames).toEqual(['玉ねぎ', '豚こま切れ肉'])

    const byPork = await api.call<{ items: RecipeSummary[] }>('GET', `/recipes?ingredientId=${pork.id}`)
    expect(byPork.body.items.map((r) => r.title)).toEqual(['豚肉と玉ねぎの煮物'])
    const byTitle = await api.call<{ items: RecipeSummary[] }>('GET', `/recipes?q=${encodeURIComponent('スープ')}`)
    expect(byTitle.body.items.map((r) => r.title)).toEqual(['オニオンスープ'])
    // 料理名になくても、材料の食材名で見つかる
    const byIngredient = await api.call<{ items: RecipeSummary[] }>('GET', `/recipes?q=${encodeURIComponent('豚こま')}`)
    expect(byIngredient.body.items.map((r) => r.title)).toEqual(['豚肉と玉ねぎの煮物'])
  })

  it('削除は論理削除。一覧と取得から消える', async () => {
    const { body: created } = await api.call<Recipe>('POST', '/recipes', curry())
    expect((await api.call('DELETE', `/recipes/${created.id}`)).status).toBe(204)
    expect((await api.call('GET', `/recipes/${created.id}`)).status).toBe(404)
    expect((await api.call<{ items: RecipeSummary[] }>('GET', '/recipes')).body.items).toEqual([])
  })

  it('公式レシピの情報を保存できる。更新で省略したら残り、null なら消える', async () => {
    const official = {
      officialMenuNo: '063',
      imageKey: 'img/R0001.jpg',
      favoriteCount: 120,
      cookCount: 3400,
      score: 5,
    }
    const { body: created } = await api.call<Recipe>('POST', '/recipes', curry({ ...official, sourceType: 'url' }))
    expect(created).toMatchObject(official)

    const kept = await api.call<Recipe>('PUT', `/recipes/${created.id}`, curry({ title: '名前だけ変える' }))
    expect(kept.body).toMatchObject({ ...official, title: '名前だけ変える' })

    const cleared = await api.call<Recipe>('PUT', `/recipes/${created.id}`, curry({ imageKey: null }))
    expect(cleared.body.imageKey).toBeNull()
    expect(cleared.body.favoriteCount).toBe(120)

    const list = await api.call<{ items: RecipeSummary[] }>('GET', '/recipes')
    expect(list.body.items[0]).toMatchObject({
      officialMenuNo: '063',
      imageKey: null,
      favoriteCount: 120,
      cookCount: 3400,
    })
  })

  it.each([
    ['img/ 以外の画像キー', { imageKey: 'other/a.jpg' }],
    ['.. を含む画像キー', { imageKey: 'img/../a.jpg' }],
    ['3 桁でないメニュー番号', { officialMenuNo: '63' }],
    ['負の件数', { favoriteCount: -1 }],
  ])('%s は 400', async (_, overrides) => {
    expect((await api.call('POST', '/recipes', curry(overrides as Partial<RecipeInput>))).status).toBe(400)
  })

  it('一覧は人気順・よく作られている順に並べ替えられる。件数のないレシピは後ろ、省略なら料理名順', async () => {
    await api.call('POST', '/recipes', curry({ title: 'あ', favoriteCount: 10, cookCount: 500 }))
    await api.call('POST', '/recipes', curry({ title: 'い', favoriteCount: 300, cookCount: 20 }))
    await api.call('POST', '/recipes', curry({ title: 'う' }))
    await api.call('POST', '/recipes', curry({ title: 'え', favoriteCount: 300, cookCount: null }))
    const titles = async (qs: string) =>
      (await api.call<{ items: RecipeSummary[] }>('GET', `/recipes${qs}`)).body.items.map((r) => r.title)
    expect(await titles('?sort=popular')).toEqual(['い', 'え', 'あ', 'う'])
    expect(await titles('?sort=cooked')).toEqual(['あ', 'い', 'う', 'え'])
    expect(await titles('')).toEqual(['あ', 'い', 'う', 'え'])
    expect((await api.call('GET', '/recipes?sort=score')).status).toBe(400)
  })

  it('存在しないレシピは 404', async () => {
    expect((await api.call('GET', '/recipes/nope')).status).toBe(404)
    expect((await api.call('PUT', '/recipes/nope', curry())).status).toBe(404)
    expect((await api.call('DELETE', '/recipes/nope')).status).toBe(404)
  })
})

describe('初期データのレシピ', () => {
  it('一覧と詳細で読める', async () => {
    const seeded = createTestApi({ seed: true })
    const list = await seeded.call<{ items: RecipeSummary[] }>('GET', '/recipes')
    expect(list.body.items.length).toBeGreaterThanOrEqual(10)
    const first = list.body.items[0]
    if (!first) throw new Error('レシピがない')
    const detail = await seeded.call<Recipe>('GET', `/recipes/${first.id}`)
    expect(detail.body.sourceType).toBe('seed')
    expect(detail.body.ingredients.length).toBeGreaterThan(0)
  })
})
