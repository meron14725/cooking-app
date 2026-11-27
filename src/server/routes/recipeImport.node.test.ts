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

describe('POST /api/recipes/import-url', () => {
  it('ページを取得して下書きを返す。マスタと照合し、単位を直す', async () => {
    const spy = servePage(page)
    const res = await api.call<RecipeDraft>('POST', '/recipes/import-url', { url: 'https://example.com/soup' })
    expect(res.status).toBe(200)
    expect(spy).toHaveBeenCalledOnce()
    expect(res.body.title).toBe('玉ねぎスープ')
    expect(res.body.sourceUrl).toBe('https://example.com/soup')
    expect(res.body.ingredients.map((i) => [i.suggestedName, i.ingredientId !== null, i.quantity])).toEqual([
      ['玉ねぎ', true, 1.5],
      ['ぶり', false, 2],
    ])
    expect(res.body.warnings.some((w) => w.includes('ぶり'))).toBe(true)
  })

  it('ローカルの URL は 400、ページが取れなければ 502', async () => {
    expect((await api.call('POST', '/recipes/import-url', { url: 'http://localhost/' })).status).toBe(400)
    servePage('not found', { status: 404 })
    const res = await api.call<{ error: { code: string } }>('POST', '/recipes/import-url', {
      url: 'https://example.com/none',
    })
    expect(res.status).toBe(502)
    expect(res.body.error.code).toBe('FETCH_FAILED')
  })

  it('HTML でなければ 400', async () => {
    servePage('{}', { headers: { 'Content-Type': 'application/json' } })
    expect((await api.call('POST', '/recipes/import-url', { url: 'https://example.com/a.json' })).status).toBe(400)
  })

  it('AI の API キーがなければ 503', async () => {
    const noKey = createTestApi({ env: { AI_PROVIDER: 'gemini' } })
    servePage(page)
    const res = await noKey.call<{ error: { code: string } }>('POST', '/recipes/import-url', {
      url: 'https://example.com/soup',
    })
    expect(res.status).toBe(503)
    expect(res.body.error.code).toBe('AI_NOT_CONFIGURED')
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
