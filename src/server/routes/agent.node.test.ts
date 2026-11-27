import { beforeEach, describe, expect, it } from 'vitest'
import { todayJst } from '../../shared/domain/date'
import type { AgentApplyResult, AgentResult } from '../../shared/schemas/agent'
import type { Ingredient } from '../../shared/schemas/ingredient'
import type { InventoryItem } from '../../shared/schemas/inventory'
import type { Plan } from '../../shared/schemas/plan'
import type { Recipe, RecipeInput } from '../../shared/schemas/recipe'
import type { AgentCall, AgentRunner } from '../ai/agent'
import { createDb } from '../db/client'
import { requestAgent } from '../services/agent'
import { createTestApi } from '../testing/app'

let api: ReturnType<typeof createTestApi>
let onion: Ingredient
let pork: Ingredient
const today = todayJst()

const stock = async () => (await api.call<{ items: InventoryItem[] }>('GET', '/inventory')).body.items

const recipeInput = (title: string): RecipeInput => ({
  title,
  servings: 2,
  ingredients: [
    { ingredientId: onion.id, quantity: 1, displayText: '玉ねぎ 1個' },
    { ingredientId: pork.id, quantity: 200, displayText: '豚こま切れ肉 200g' },
  ],
  steps: [{ phase: 'cook', text: '内鍋に入れて加熱する' }],
})

/** 決まった道具を呼ぶだけのエージェント */
const runnerOf = (calls: AgentCall[]): AgentRunner => ({ run: async () => ({ reply: 'ok', calls }) })

beforeEach(async () => {
  api = createTestApi()
  const make = async (body: Record<string, unknown>) => (await api.call<Ingredient>('POST', '/ingredients', body)).body
  onion = await make({
    name: '玉ねぎ',
    category: 'vegetable',
    unit: '個',
    canFreeze: true,
    fridgeDays: 30,
    defaultLocation: 'pantry',
  })
  pork = await make({
    name: '豚こま切れ肉',
    category: 'meat',
    unit: 'g',
    canFreeze: true,
    fridgeDays: 3,
    freezerDays: 30,
    defaultLocation: 'fridge',
  })
  await api.call('POST', '/inventory', { ingredientId: onion.id, quantity: 2 })
})

describe('POST /api/agent/requests → /apply', () => {
  it('変更案を返すだけで DB は変えない。選んだ案を反映すると変わる', async () => {
    const res = await api.call<AgentResult>('POST', '/agent/requests', { instruction: '玉ねぎを使った' })
    expect(res.status).toBe(200)
    expect(res.body.operations).toHaveLength(1)
    const op = res.body.operations[0]
    expect(op).toMatchObject({ op: 'inventory.update', input: { quantity: 1 }, summary: '在庫 玉ねぎ: 2個 → 1個' })
    expect(op?.baseUpdatedAt).toMatch(/^\d{4}-\d\d-\d\dT/)
    expect((await stock())[0]?.quantity).toBe(2)

    const applied = await api.call<AgentApplyResult>('POST', '/agent/apply', { operations: res.body.operations })
    expect(applied.body.results).toEqual([{ ok: true }])
    expect((await stock())[0]?.quantity).toBe(1)

    // 同じ案をもう一度送っても、対象が変わっているので反映しない
    const again = await api.call<AgentApplyResult>('POST', '/agent/apply', { operations: res.body.operations })
    expect(again.body.results[0]).toMatchObject({ ok: false, error: expect.stringContaining('変わりました') })
    expect((await stock())[0]?.quantity).toBe(1)
  })

  it('反映の前に入力をもう一度検証する（画面から来た値を信じない）', async () => {
    const res = await api.call<AgentResult>('POST', '/agent/requests', { instruction: '玉ねぎを使った' })
    const op = { ...res.body.operations[0], input: { quantity: -1 } }
    const applied = await api.call<AgentApplyResult>('POST', '/agent/apply', { operations: [op] })
    expect(applied.body.results[0]?.ok).toBe(false)
    expect((await stock())[0]?.quantity).toBe(2)
    expect(
      (await api.call('POST', '/agent/apply', { operations: [{ ...op, baseUpdatedAt: 'yesterday' }] })).status,
    ).toBe(400)
  })

  it('頼みが空なら 400。gemini のときは 503', async () => {
    expect((await api.call('POST', '/agent/requests', { instruction: ' ' })).status).toBe(400)
    const gemini = createTestApi({ env: { AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'k' } })
    expect((await gemini.call('POST', '/agent/requests', { instruction: 'x' })).status).toBe(503)
  })
})

describe('requestAgent', () => {
  it('知らない道具・対象のない案・形の違う案は捨てて warnings に書く。summary と baseUpdatedAt は Worker が入れる', async () => {
    const db = createDb(api.env.DB)
    const row = (await stock())[0]
    const result = await requestAgent(
      db,
      runnerOf([
        { tool: 'drop_table', args: {} },
        { tool: 'propose_inventory_use_up', args: { targetId: 'nope' } },
        { tool: 'propose_inventory_add', args: { input: { ingredientId: pork.id, quantity: -5 } } },
        {
          tool: 'propose_inventory_add',
          args: { input: { ingredientId: pork.id, quantity: 300, location: 'freezer' }, summary: 'うそ' },
        },
        { tool: 'propose_inventory_use_up', args: { targetId: row?.id, baseUpdatedAt: '2000-01-01T00:00:00.000Z' } },
      ]),
      'x',
      today,
    )
    expect(result.warnings).toHaveLength(3)
    expect(result.operations.map((o) => [o.op, o.summary])).toEqual([
      ['inventory.add', '在庫に追加: 豚こま切れ肉 300g（冷凍）'],
      ['inventory.use_up', '在庫 玉ねぎ 2個 を使い切り'],
    ])
    expect(result.operations[1]?.baseUpdatedAt).not.toBe('2000-01-01T00:00:00.000Z')
  })

  it('baseUpdatedAt はエージェントの実行前（スナップショット）の値。実行中に変わった行の案は反映しない', async () => {
    const db = createDb(api.env.DB)
    const row = (await stock())[0]
    const runner: AgentRunner = {
      run: async () => {
        // エージェントが考えている間に、画面から在庫を直した
        await new Promise((r) => setTimeout(r, 5))
        await api.call('PATCH', `/inventory/${row?.id}`, { quantity: 5 })
        return {
          reply: 'ok',
          calls: [{ tool: 'propose_inventory_update', args: { targetId: row?.id, input: { quantity: 1 } } }],
        }
      },
    }
    const { operations } = await requestAgent(db, runner, 'x', today)
    expect(operations[0]?.summary).toBe('在庫 玉ねぎ: 2個 → 1個')
    const applied = await api.call<AgentApplyResult>('POST', '/agent/apply', { operations })
    expect(applied.body.results[0]?.ok).toBe(false)
    expect((await stock())[0]?.quantity).toBe(5)
  })

  it('同じ対象への 2 つ目の案は捨てる（形の違う案は数えない）', async () => {
    const db = createDb(api.env.DB)
    const id = (await stock())[0]?.id
    const result = await requestAgent(
      db,
      runnerOf([
        { tool: 'propose_inventory_update', args: { targetId: id, input: { quantity: -1 } } },
        { tool: 'propose_inventory_update', args: { targetId: id, input: { quantity: 1 } } },
        { tool: 'propose_inventory_use_up', args: { targetId: id } },
      ]),
      'x',
      today,
    )
    expect(result.operations.map((o) => o.op)).toEqual(['inventory.update'])
    expect(result.warnings).toHaveLength(2)
    expect(result.warnings[1]).toContain('同じ対象')
  })

  it('献立の料理を入れ替えると plans.updated_at が変わり、古い案は反映しない', async () => {
    const r1 = (await api.call<Recipe>('POST', '/recipes', recipeInput('肉じゃが'))).body
    const r2 = (await api.call<Recipe>('POST', '/recipes', recipeInput('豚汁'))).body
    const plan = (await api.call<Plan>('POST', '/plans', { anchors: [{ recipeId: r1.id, servings: 1 }] })).body
    const db = createDb(api.env.DB)
    const set = (recipeId: string) => ({
      tool: 'propose_plan_set_recipes',
      args: { targetId: plan.id, input: { recipes: [{ recipeId, role: 'anchor', servings: 2, dayIndex: 1 }] } },
    })
    const { operations } = await requestAgent(db, runnerOf([set(r2.id)]), 'x', today)
    expect(operations[0]?.summary).toBe('献立の料理: 肉じゃが（1食） → 豚汁（2食）')
    // 画面を開いた後に、画面から料理を入れ替えた
    await new Promise((r) => setTimeout(r, 5))
    await api.call('PUT', `/plans/${plan.id}/recipes`, {
      recipes: [{ recipeId: r1.id, role: 'anchor', servings: 3, dayIndex: 1 }],
    })
    const applied = await api.call<AgentApplyResult>('POST', '/agent/apply', { operations })
    expect(applied.body.results[0]?.ok).toBe(false)
  })

  it('レシピは材料・手順だけ変えても updated_at が変わる。差分を summary に出す', async () => {
    const r = (await api.call<Recipe>('POST', '/recipes', recipeInput('肉じゃが'))).body
    const db = createDb(api.env.DB)
    const changed = {
      ...recipeInput('肉じゃが'),
      ingredients: [{ ingredientId: onion.id, quantity: 2, displayText: '玉ねぎ 2個' }],
    }
    const { operations } = await requestAgent(
      db,
      runnerOf([{ tool: 'propose_recipe_update', args: { targetId: r.id, input: changed } }]),
      'x',
      today,
    )
    expect(operations[0]?.summary).toBe(
      'レシピ「肉じゃが」を更新: 材料から外す: 玉ねぎ 1個、豚こま切れ肉 200g、材料に入れる: 玉ねぎ 2個',
    )
    await new Promise((res) => setTimeout(res, 5))
    expect((await api.call<AgentApplyResult>('POST', '/agent/apply', { operations })).body.results).toEqual([
      { ok: true },
    ])
    expect((await api.call<AgentApplyResult>('POST', '/agent/apply', { operations })).body.results[0]?.ok).toBe(false)
  })
})
