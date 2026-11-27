import { describe, expect, it } from 'vitest'
import { ApiError } from '../errors'
import { CursorProvider } from './cursor'
import { getProvider } from './index'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function fakeAgent(responses: (Response | Error)[]) {
  const calls: Record<string, unknown>[] = []
  const fetch = async (req: Request) => {
    calls.push({ url: req.url, ...((await req.json()) as Record<string, unknown>) })
    const res = responses.shift()
    if (!res) throw new Error('想定外の呼び出し')
    if (res instanceof Error) throw res
    return res
  }
  return { fetch, calls }
}

describe('CursorProvider', () => {
  it('Container の /structured に JSON スキーマ付きで送り、結果を zod で検証して返す', async () => {
    const { fetch, calls } = fakeAgent([json({ result: { caloriesKcal: 480 } })])
    const ai = new CursorProvider({ fetch })
    await expect(ai.estimateCalories({ servings: 2, ingredients: [{ displayText: '豚肉 200g' }] })).resolves.toEqual({
      caloriesKcal: 480,
    })
    expect(calls[0]?.url).toBe('http://agent/structured')
    expect(calls[0]?.prompt).toContain('豚肉 200g')
    expect(JSON.stringify(calls[0]?.jsonSchema)).toContain('caloriesKcal')
    expect(calls[0]?.timeoutMs).toBe(45_000)
  })

  it('形が違えば残り時間で 1 回だけやり直し、2 回ともだめなら 502', async () => {
    const ok = new CursorProvider({
      fetch: fakeAgent([json({ result: {} }), json({ result: { caloriesKcal: 1 } })]).fetch,
    })
    await expect(ok.estimateCalories({ servings: 1, ingredients: [{ displayText: 'x' }] })).resolves.toEqual({
      caloriesKcal: 1,
    })
    const bad = new CursorProvider({ fetch: fakeAgent([json({ result: {} }), json({ result: {} })]).fetch })
    await expect(bad.estimateCalories({ servings: 1, ingredients: [{ displayText: 'x' }] })).rejects.toMatchObject({
      status: 502,
    })
  })

  it('残り時間が少なければやり直さない', async () => {
    let t = 0
    const { fetch, calls } = fakeAgent([json({ result: {} })])
    const ai = new CursorProvider({
      fetch: async (req) => {
        t += 70_000 // 1 回目で 70 秒かかった
        return fetch(req)
      },
      now: () => t,
    })
    await expect(ai.estimateCalories({ servings: 1, ingredients: [{ displayText: 'x' }] })).rejects.toMatchObject({
      status: 502,
    })
    expect(calls).toHaveLength(1)
  })

  it('Container に繋がらなければ 503 AI_STARTING、設定なしは 503、時間切れは 502', async () => {
    const input = { servings: 1, ingredients: [{ displayText: 'x' }] }
    await expect(
      new CursorProvider({ fetch: fakeAgent([new Error('starting')]).fetch }).estimateCalories(input),
    ).rejects.toMatchObject({ status: 503, code: 'AI_STARTING' })
    await expect(
      new CursorProvider({
        fetch: fakeAgent([json({ error: { code: 'AI_NOT_CONFIGURED', message: 'no key' } }, 503)]).fetch,
      }).estimateCalories(input),
    ).rejects.toMatchObject({ status: 503, code: 'AI_NOT_CONFIGURED' })
    await expect(
      new CursorProvider({ fetch: fakeAgent([json({ error: { code: 'TIMEOUT' } }, 504)]).fetch }).estimateCalories(
        input,
      ),
    ).rejects.toMatchObject({ status: 502 })
  })
})

describe('getProvider', () => {
  it('既定は cursor。binding かキーがなければ黙って fake にせず 503', () => {
    const get = (env: Parameters<typeof getProvider>[0]) => {
      try {
        return getProvider(env).constructor.name
      } catch (err) {
        return err instanceof ApiError ? `${err.status} ${err.code}` : String(err)
      }
    }
    expect(get({})).toBe('503 AI_NOT_CONFIGURED')
    expect(get({ AI_PROVIDER: 'cursor', CURSOR_API_KEY: 'k' })).toBe('503 AI_NOT_CONFIGURED')
    const agent = {} as NonNullable<Parameters<typeof getProvider>[0]['AGENT']>
    expect(get({ AGENT: agent, CURSOR_API_KEY: 'k' })).toBe('CursorProvider')
    expect(get({ AI_PROVIDER: 'fake' })).toBe('FakeProvider')
    expect(get({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'k' })).toBe('GeminiProvider')
  })
})
