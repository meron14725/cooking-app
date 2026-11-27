import { describe, expect, it } from 'vitest'
import { handleStructured, type RunAgent } from './app'

const body = { system: 'sys', prompt: 'p', jsonSchema: { type: 'object' } }

describe('handleStructured', () => {
  it('submit_result の 1 回目の引数を結果にする', async () => {
    let prompt = ''
    const run: RunAgent = async ({ tools, prompt: p }) => {
      prompt = p
      await tools.submit_result?.execute({ caloriesKcal: 480 })
      await tools.submit_result?.execute({ caloriesKcal: 999 })
      return { usage: { inputTokens: 10 } }
    }
    const res = await handleStructured(body, run)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ result: { caloriesKcal: 480 }, usage: { inputTokens: 10 } })
    expect(prompt).toContain('submit_result')
  })

  it('道具に渡す JSON スキーマはそのまま', async () => {
    let schema: unknown
    await handleStructured(body, async ({ tools }) => {
      schema = tools.submit_result?.inputSchema
      return {}
    })
    expect(schema).toEqual({ type: 'object' })
  })

  it('結果を返さなければ 502、失敗も 502、入力が足りなければ 400', async () => {
    expect((await handleStructured(body, async () => ({}))).status).toBe(502)
    const failed = await handleStructured(body, async () => {
      throw new Error('auth')
    })
    expect(failed).toEqual({ status: 502, body: { error: { code: 'AGENT_ERROR', message: 'auth' } } })
    expect((await handleStructured({ system: 's' }, async () => ({}))).status).toBe(400)
  })

  it('時間内に終わらなければ 504（エージェントは止める）', async () => {
    let aborted = false
    const res = await handleStructured({ ...body, timeoutMs: 20 }, ({ signal }) => {
      signal.addEventListener('abort', () => {
        aborted = true
      })
      return new Promise(() => {})
    })
    expect(res.status).toBe(504)
    expect(aborted).toBe(true)
  })
})
