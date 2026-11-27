import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Ingredient } from '../../shared/schemas/ingredient'
import type { RecipeDraft } from '../../shared/schemas/recipeDraft'
import { createTestApi } from '../testing/app'

const page = `<html><head><title>玉ねぎスープ</title>
<script type="application/ld+json">${JSON.stringify({
  '@type': 'Recipe',
  name: '玉ねぎスープ',
  recipeIngredient: ['玉ねぎ 300 g', 'ぶり 2 切れ'],
})}</script></head><body></body></html>`

let api: ReturnType<typeof createTestApi>
const realFetch = globalThis.fetch

beforeEach(async () => {
  api = createTestApi()
  await api.call<Ingredient>('POST', '/ingredients', {
    name: '玉ねぎ',
    aliases: ['たまねぎ'],
    category: 'vegetable',
    unit: '個',
    gramsPerUnit: 200,
    canFreeze: true,
    fridgeDays: 30,
    defaultLocation: 'pantry',
  })
})

afterEach(() => {
  globalThis.fetch = realFetch
})

function servePage(body: string, init: ResponseInit = { headers: { 'Content-Type': 'text/html; charset=utf-8' } }) {
  const spy = vi.fn(async () => new Response(body, init))
  globalThis.fetch = spy as unknown as typeof fetch
  return spy
}

describe('POST /api/recipes/draft（URL）', () => {
  it('ページを取得して下書きを返す。マスタと照合し、単位を直す', async () => {
    const spy = servePage(page)
    const res = await api.call<RecipeDraft>('POST', '/recipes/draft', { text: 'https://example.com/soup' })
    expect(res.status).toBe(200)
    expect(spy).toHaveBeenCalledOnce()
    expect(res.body.title).toBe('玉ねぎスープ')
    expect(res.body.sourceUrl).toBe('https://example.com/soup')
    expect(res.body.sourceType).toBe('url')
    expect(res.body.official).toBeNull()
    expect(res.body.ingredients.map((i) => [i.suggestedName, i.ingredientId !== null, i.quantity])).toEqual([
      ['玉ねぎ', true, 1.5],
      ['ぶり', false, 2],
    ])
    expect(res.body.warnings.some((w) => w.includes('ぶり'))).toBe(true)
  })

  it('ページが取れなければ 502', async () => {
    servePage('not found', { status: 404 })
    const res = await api.call<{ error: { code: string } }>('POST', '/recipes/draft', {
      text: 'https://example.com/none',
    })
    expect(res.status).toBe(502)
    expect(res.body.error.code).toBe('FETCH_FAILED')
  })

  it('HTML でなければ 400', async () => {
    servePage('{}', { headers: { 'Content-Type': 'application/json' } })
    expect((await api.call('POST', '/recipes/draft', { text: 'https://example.com/a.json' })).status).toBe(400)
  })

  it('AI の API キーがなければ 503', async () => {
    const noKey = createTestApi({ env: { AI_PROVIDER: 'gemini' } })
    servePage(page)
    const res = await noKey.call<{ error: { code: string } }>('POST', '/recipes/draft', {
      text: 'https://example.com/soup',
    })
    expect(res.status).toBe(503)
    expect(res.body.error.code).toBe('AI_NOT_CONFIGURED')
  })

  it('取り込み専用の import-url はもうない（404）', async () => {
    expect((await api.call('POST', '/recipes/import-url', { url: 'https://example.com/soup' })).status).toBe(404)
  })
})

describe('POST /api/recipes/suggest', () => {
  it('余りの食材から下書きを返す。マスタと照合し、作成元は ai', async () => {
    const onion = (await api.call<{ items: Ingredient[] }>('GET', '/ingredients')).body.items.find(
      (i) => i.name === '玉ねぎ',
    )
    const res = await api.call<RecipeDraft>('POST', '/recipes/suggest', {
      leftovers: [{ ingredientId: onion?.id, quantity: 1.5 }],
    })
    expect(res.status).toBe(200)
    expect(res.body.title).toBe('玉ねぎの煮物')
    expect(res.body.sourceType).toBe('ai')
    expect(res.body.sourceUrl).toBeNull()
    expect(res.body.ingredients[0]).toMatchObject({ ingredientId: onion?.id, quantity: 1.5 })
  })

  it('余りが空、またはマスタにない食材だけなら 400', async () => {
    expect((await api.call('POST', '/recipes/suggest', { leftovers: [] })).status).toBe(400)
    const res = await api.call<{ error: { code: string } }>('POST', '/recipes/suggest', {
      leftovers: [{ ingredientId: 'nope', quantity: 1 }],
    })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('UNKNOWN_INGREDIENT')
  })
})

describe('POST /api/recipes/estimate-calories', () => {
  it('1 人前のカロリーを返す', async () => {
    const res = await api.call<{ caloriesKcal: number }>('POST', '/recipes/estimate-calories', {
      servings: 2,
      ingredients: [{ displayText: '玉ねぎ 1個' }, { displayText: '豚肉 200g' }],
    })
    expect(res.status).toBe(200)
    expect(res.body.caloriesKcal).toBe(150)
  })

  it('材料が空なら 400', async () => {
    expect((await api.call('POST', '/recipes/estimate-calories', { servings: 2, ingredients: [] })).status).toBe(400)
  })
})

// 公式レシピの本文は使わない。形だけ合わせた架空のデータ
const cocoroJson = {
  name: 'テスト用の玉ねぎ煮',
  quantity: '2人分',
  cookingTime: '約30分',
  calorie: '100kcal',
  menuNum: '0063',
  isMixed: true,
  imageUrl: 'https://example.com/photo.jpg',
  favoriteCount: 1234,
  cookCount: 56789,
  score: 5,
  materials: [
    { name: '玉ねぎ（くし形切り）', quantity: '300 g', group: null, orderNumber: 1 },
    { name: 'テスト調味料', quantity: '大さじ1と1/2', group: 'A', orderNumber: 2 },
  ],
  material_appendices: ['テスト用の注記'],
  methods: [
    { text: '材料を切る', renderedHtml: '<p>材料を切る</p>', orderNumber: 1 },
    { text: '内鍋に入れる', renderedHtml: '<p>内鍋に入れる</p>', orderNumber: 2 },
  ],
  unusedField: { nested: true },
}

const COCORO_URL = 'https://cocoroplus.jp.sharp/kitchen/recipe/hotcook/KN-HW24G/R9001'

describe('POST /api/recipes/draft（COCORO KITCHEN の URL）', () => {
  it('レシピの JSON API を 1 件だけ取り、AI を使わずに下書きを組み立てる', async () => {
    const spy = vi.fn(async () => Response.json(cocoroJson))
    globalThis.fetch = spy as unknown as typeof fetch
    // AI のキーがなくても作れる（AI を呼ばない）
    const noKey = createTestApi({ env: { AI_PROVIDER: 'gemini' } })
    await noKey.call<Ingredient>('POST', '/ingredients', {
      name: '玉ねぎ',
      category: 'vegetable',
      unit: '個',
      gramsPerUnit: 200,
      canFreeze: true,
      fridgeDays: 30,
      defaultLocation: 'pantry',
    })
    const res = await noKey.call<RecipeDraft>('POST', '/recipes/draft', { text: COCORO_URL })
    expect(res.status).toBe(200)
    expect(spy).toHaveBeenCalledOnce()
    expect((spy.mock.calls[0] as unknown[])[0]).toBe(
      'https://cocoroplus.jp.sharp/kitchen/recipe/api/recipe/R9001/KN-HW24G',
    )
    expect(res.body).toMatchObject({
      title: 'テスト用の玉ねぎ煮',
      servings: 2,
      caloriesKcal: 100,
      hotcookMode: 'メニュー番号で探す → No.063',
      sourceUrl: COCORO_URL,
      sourceType: 'url',
    })
    expect(res.body.official).toEqual({
      officialMenuNo: '063',
      imageKey: 'img/R9001.jpg',
      favoriteCount: 1234,
      cookCount: 56789,
      score: 5,
      cookMinutes: 30,
      usesMixingUnit: true,
    })
    expect(res.body.ingredients.map((i) => [i.suggestedName, i.ingredientId !== null, i.quantity, i.cutStyle])).toEqual(
      [
        ['玉ねぎ', true, 1.5, 'くし形切り'],
        ['テスト調味料', false, 1.5, null],
      ],
    )
    expect(res.body.ingredients[1]?.displayText).toBe('テスト調味料 大さじ1と1/2（A）')
    expect(res.body.steps).toEqual([
      { phase: 'prep', text: '材料を切る' },
      { phase: 'cook', text: '内鍋に入れる' },
      { phase: 'cook', text: 'まぜ技ユニットを付ける' },
    ])
    expect(res.body.warnings).toContain('※ テスト用の注記')
  })

  it('URL に機種がなければ KN-HW16G で取る。写真がなければ imageKey は null', async () => {
    const spy = vi.fn(async () => Response.json({ ...cocoroJson, imageUrl: '' }))
    globalThis.fetch = spy as unknown as typeof fetch
    const res = await api.call<RecipeDraft>('POST', '/recipes/draft', {
      text: 'https://cocoroplus.jp.sharp/kitchen/recipe/hotcook/R9002',
    })
    expect((spy.mock.calls[0] as unknown[])[0]).toBe(
      'https://cocoroplus.jp.sharp/kitchen/recipe/api/recipe/R9002/KN-HW16G',
    )
    expect(res.body.official?.imageKey).toBeNull()
  })

  it('メモが付いていれば本文とメモを AI に読ませる。メニュー番号は JSON の値を使う', async () => {
    const spy = vi.fn(async () => Response.json(cocoroJson))
    globalThis.fetch = spy as unknown as typeof fetch
    const res = await api.call<RecipeDraft>('POST', '/recipes/draft', { text: `${COCORO_URL}\n玉ねぎ多めで` })
    expect(res.status).toBe(200)
    expect(spy).toHaveBeenCalledOnce()
    // fake の AI は本文の 1 行目をタイトル、「- 」の行を材料にする
    expect(res.body.title).toBe('テスト用の玉ねぎ煮')
    expect(res.body.hotcookMode).toBe('メニュー番号で探す → No.063')
    expect(res.body.official?.officialMenuNo).toBe('063')
  })

  it('JSON が取れなければ 502', async () => {
    servePage('not found', { status: 404 })
    const res = await api.call<{ error: { code: string } }>('POST', '/recipes/draft', {
      text: 'https://cocoroplus.jp.sharp/kitchen/recipe/hotcook/KN-HW16G/R9003',
    })
    expect(res.status).toBe(502)
    expect(res.body.error.code).toBe('FETCH_FAILED')
  })
})

describe('POST /api/recipes/draft（＋のパネル）', () => {
  it('URL を含めば、そのページから下書きを作る（URL 以外の文はメモとして渡す）', async () => {
    const spy = servePage(page)
    const res = await api.call<RecipeDraft>('POST', '/recipes/draft', {
      text: 'これ作りたい https://example.com/soup 玉ねぎ多めで',
    })
    expect(res.status).toBe(200)
    expect((spy.mock.calls[0] as unknown[])[0]).toBe('https://example.com/soup')
    expect(res.body.title).toBe('玉ねぎスープ')
    expect(res.body.sourceType).toBe('url')
    expect(res.body.sourceUrl).toBe('https://example.com/soup')
  })

  it('URL がなければ、文から AI が下書きを作る（ページは取りに行かない）', async () => {
    const spy = servePage(page)
    const res = await api.call<RecipeDraft>('POST', '/recipes/draft', {
      text: '祖母の煮物\n材料:\n- 玉ねぎ 300 g',
    })
    expect(res.status).toBe(200)
    expect(spy).not.toHaveBeenCalled()
    expect(res.body.title).toBe('祖母の煮物')
    expect(res.body.sourceType).toBe('ai')
    expect(res.body.sourceUrl).toBeNull()
    expect(res.body.official).toBeNull()
    expect(res.body.ingredients.map((i) => [i.suggestedName, i.ingredientId !== null, i.quantity])).toEqual([
      ['玉ねぎ', true, 1.5],
    ])
  })

  it('空なら 400、ローカルの URL も 400', async () => {
    expect((await api.call('POST', '/recipes/draft', { text: '   ' })).status).toBe(400)
    expect((await api.call('POST', '/recipes/draft', { text: 'http://localhost/a' })).status).toBe(400)
  })

  it('AI の API キーがなければ 503', async () => {
    const noKey = createTestApi({ env: { AI_PROVIDER: 'gemini' } })
    const res = await noKey.call<{ error: { code: string } }>('POST', '/recipes/draft', { text: '肉じゃが' })
    expect(res.status).toBe(503)
  })
})
