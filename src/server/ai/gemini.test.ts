import { describe, expect, it } from 'vitest'
import { recipeDraftRawSchema } from '../../shared/schemas/recipeDraft'
import { GeminiProvider, looseJsonSchema } from './gemini'

const reply = (text: string, status = 200) =>
  new Response(
    JSON.stringify(
      status === 200 ? { candidates: [{ content: { parts: [{ text }] } }] } : { error: { message: text } },
    ),
    {
      status,
      headers: { 'Content-Type': 'application/json' },
    },
  )

function fakeFetch(responses: Response[]) {
  const calls: { url: string; body: Record<string, unknown>; headers: Headers }[] = []
  const fn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init?.body)), headers: new Headers(init?.headers) })
    const res = responses.shift()
    if (!res) throw new Error('想定外の呼び出し')
    return res
  }) as unknown as typeof fetch
  return { fn, calls }
}

describe('GeminiProvider', () => {
  it('JSON スキーマ付きで呼び、結果を検証して返す', async () => {
    const { fn, calls } = fakeFetch([reply('{"caloriesKcal": 480}')])
    const ai = new GeminiProvider({ apiKey: 'k', model: 'm', fetch: fn })
    await expect(ai.estimateCalories({ servings: 2, ingredients: [{ displayText: '豚肉 200g' }] })).resolves.toEqual({
      caloriesKcal: 480,
    })
    expect(calls[0]?.url).toContain('/models/m:generateContent')
    expect(calls[0]?.headers.get('x-goog-api-key')).toBe('k')
    const config = calls[0]?.body.generationConfig as { responseMimeType: string; responseJsonSchema: unknown }
    expect(config.responseMimeType).toBe('application/json')
    expect(JSON.stringify(config.responseJsonSchema)).not.toContain('maximum')
  })

  it('補完提案: 余りと避けるタイトルをプロンプトに入れる。購入日などは渡さない', async () => {
    const draft = {
      title: '玉ねぎの煮物',
      servings: 1,
      caloriesKcal: 600,
      hotcookMode: null,
      maxServings1_6l: null,
      ingredients: [{ displayText: '玉ねぎ 1個', name: '玉ねぎ', quantity: 1, unit: '個', cutStyle: null }],
      steps: [],
      warnings: [],
    }
    const { fn, calls } = fakeFetch([reply(JSON.stringify(draft))])
    const ai = new GeminiProvider({ apiKey: 'k', fetch: fn })
    await expect(
      ai.suggestRecipe({
        leftovers: [{ name: '玉ねぎ', quantity: 1.5, unit: '個' }],
        avoidTitles: ['肉じゃが'],
        ingredients: [{ name: '玉ねぎ', unit: '個', gramsPerUnit: 200 }],
      }),
    ).resolves.toEqual(draft)
    const prompt = JSON.stringify(calls[0]?.body.contents)
    expect(prompt).toContain('玉ねぎ 1.5個')
    expect(prompt).toContain('肉じゃが')
  })

  it('検証に失敗したら 1 回だけ再試行する', async () => {
    const { fn, calls } = fakeFetch([reply('{"caloriesKcal": "たくさん"}'), reply('{"caloriesKcal": 300}')])
    const ai = new GeminiProvider({ apiKey: 'k', fetch: fn })
    await expect(ai.estimateCalories({ servings: 1, ingredients: [{ displayText: 'a' }] })).resolves.toEqual({
      caloriesKcal: 300,
    })
    expect(calls).toHaveLength(2)
  })

  it('2 回とも壊れていたら 502', async () => {
    const { fn } = fakeFetch([reply('not json'), reply('{}')])
    const ai = new GeminiProvider({ apiKey: 'k', fetch: fn })
    await expect(ai.estimateCalories({ servings: 1, ingredients: [{ displayText: 'a' }] })).rejects.toMatchObject({
      status: 502,
      code: 'AI_ERROR',
    })
  })

  it('API がエラーを返したら 502', async () => {
    const { fn } = fakeFetch([reply('quota exceeded', 429)])
    const ai = new GeminiProvider({ apiKey: 'k', fetch: fn })
    await expect(ai.estimateCalories({ servings: 1, ingredients: [{ displayText: 'a' }] })).rejects.toMatchObject({
      status: 502,
    })
  })
})

describe('looseJsonSchema', () => {
  it('範囲や長さの制約を外し、形は残す', () => {
    const schema = JSON.stringify(looseJsonSchema(recipeDraftRawSchema))
    for (const k of ['minimum', 'maximum', 'maxLength', 'minItems', 'maxItems', '$schema']) {
      expect(schema).not.toContain(`"${k}"`)
    }
    expect(schema).toContain('"ingredients"')
    expect(schema).toContain('"prep"')
  })
})
