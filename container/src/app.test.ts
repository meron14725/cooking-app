import { describe, expect, it } from 'vitest'
import {
  handleAgent,
  handleStructured,
  MAX_OPERATIONS,
  MAX_RESEARCH_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  type RunAgent,
} from './app'

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

  it('webSearch のときだけ検索ありで動かし、時間の上限を長くする', async () => {
    const seen: { webSearch?: boolean; aborted: boolean }[] = []
    const run: RunAgent = async ({ tools, webSearch, signal }) => {
      seen.push({ webSearch, aborted: signal.aborted })
      await tools.submit_result?.execute({ ok: true })
      return {}
    }
    await handleStructured(body, run)
    await handleStructured({ ...body, webSearch: true }, run)
    expect(seen.map((s) => s.webSearch)).toEqual([false, true])
    expect(MAX_RESEARCH_TIMEOUT_MS).toBeGreaterThan(MAX_TIMEOUT_MS)
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

describe('handleAgent', () => {
  const agentBody = {
    prompt: '玉ねぎを半分使った',
    readTools: [
      { name: 'list_inventory', description: '在庫', result: [{ id: 'inv1', name: '玉ねぎ', quantity: 1 }] },
      { name: 'get_recipe', description: 'レシピ', itemsById: { r1: { title: '肉じゃが' } } },
    ],
    opTools: [{ name: 'propose_inventory_update', description: '在庫を直す', inputSchema: { type: 'object' } }],
  }

  it('読む道具はスナップショットを返し、変更案の道具は呼ばれた引数を記録するだけ', async () => {
    const res = await handleAgent(agentBody, async ({ tools }) => {
      expect(JSON.parse(String(await tools.list_inventory?.execute({})))).toEqual([
        { id: 'inv1', name: '玉ねぎ', quantity: 1 },
      ])
      expect(JSON.parse(String(await tools.get_recipe?.execute({ id: 'r1' })))).toEqual({ title: '肉じゃが' })
      expect(await tools.get_recipe?.execute({ id: 'nope' })).toContain('見つかりません')
      await tools.propose_inventory_update?.execute({ targetId: 'inv1', input: { quantity: 0.5 } })
      return { text: '玉ねぎを 0.5 個にする案です' }
    })
    expect(res).toMatchObject({
      status: 200,
      body: {
        reply: '玉ねぎを 0.5 個にする案です',
        calls: [{ tool: 'propose_inventory_update', args: { targetId: 'inv1', input: { quantity: 0.5 } } }],
      },
    })
  })

  it(`変更案は ${MAX_OPERATIONS} 件まで`, async () => {
    const res = await handleAgent(agentBody, async ({ tools }) => {
      for (let i = 0; i < MAX_OPERATIONS + 3; i++) await tools.propose_inventory_update?.execute({ i })
      return {}
    })
    expect((res.body as { calls: unknown[] }).calls).toHaveLength(MAX_OPERATIONS)
  })

  it('形が違えば 400', async () => {
    expect((await handleAgent({ prompt: 'x', readTools: [], opTools: [{ name: 'a' }] }, async () => ({}))).status).toBe(
      400,
    )
  })
})
