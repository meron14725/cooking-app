import { beforeEach, describe, expect, it } from 'vitest'
import type { EstimateJob } from '../../shared/schemas/estimateJob'
import type { Ingredient, IngredientInput } from '../../shared/schemas/ingredient'
import { FakeProvider } from '../ai/fake'
import { AiError } from '../ai/provider'
import { ApiError } from '../errors'
import { isPermanentJobError, STALE_JOB_MS } from '../services/estimateJobs'
import { createTestApi } from '../testing/app'
import { TEST_STEP_RETRIES } from '../testing/workflow'

const base = {
  canFreeze: true,
  fridgeDays: 3,
  freezerDays: 30,
  defaultLocation: 'fridge',
} satisfies Partial<IngredientInput>

let api: ReturnType<typeof createTestApi>

const addIngredient = async (name: string, category: IngredientInput['category'] = 'vegetable', unit = '個') =>
  (await api.call<Ingredient>('POST', '/ingredients', { ...base, name, category, unit })).body
/** 取り込みのまま（未見直し）に戻す */
const resetSources = () =>
  api.sqlite.exec('UPDATE ingredients SET attributes_source = NULL, storage_source = NULL, price_yen = NULL')
const start = (body: Record<string, unknown> = {}) =>
  api.call<EstimateJob & { error?: { code: string } }>('POST', '/recipes/attributes/jobs', body)
const current = async () =>
  (await api.call<{ job: EstimateJob | null }>('GET', '/recipes/attributes/jobs/current')).body.job

/** 最初の n 回だけ失敗する AI（n = Infinity ならいつも失敗） */
function flakyAi(failures: number) {
  let calls = 0
  const fake = new FakeProvider()
  const provider = Object.create(fake) as FakeProvider
  provider.classifyIngredients = async (items) => {
    calls++
    if (calls <= failures) throw new AiError('AI の応答がありませんでした')
    return fake.classifyIngredients(items)
  }
  return { ai: () => provider, calls: () => calls }
}

beforeEach(() => {
  api = createTestApi()
})

describe('まとめて推定のジョブ', () => {
  it('始めると実行中のジョブを返し、サーバー側で最後まで進めて完了にする。件数を段ごとに残す', async () => {
    await addIngredient('謎A')
    await addIngredient('謎B')
    resetSources()
    const res = await start({ limit: 1 })
    expect(res.status).toBe(202)
    expect(res.body).toMatchObject({ status: 'running', rounds: 0, refreshStalePrices: false })
    expect((await current())?.id).toBe(res.body.id)

    await api.workflow.settled()
    const job = await current()
    expect(job).toMatchObject({ id: res.body.id, status: 'done', error: null })
    expect(job?.finishedAt).not.toBeNull()
    // limit 1 なので、食材の分類 2 回 → 日持ち 2 回 → 価格 2 回
    expect(job?.progress.ingredients).toEqual({ updated: 2, remaining: 0 })
    expect(job?.progress.storage).toEqual({ updated: 2, remaining: 0 })
    expect(job?.progress.prices).toEqual({ updated: 2, remaining: 0 })
    expect(job?.rounds).toBeGreaterThanOrEqual(3)
  })

  it('実行中のジョブがあれば 2 つ目は始めない（409）', async () => {
    await addIngredient('謎A')
    resetSources()
    const first = await start()
    const second = await start()
    expect(second.status).toBe(409)
    expect(second.body.error?.code).toBe('JOB_RUNNING')
    await api.workflow.settled()
    // 終わったら次を始められる
    expect((await start()).status).toBe(202)
    await api.workflow.settled()
    expect((await current())?.id).not.toBe(first.body.id)
  })

  it('止めると、サーバー側のジョブも次の回の前に止まり、止めたのまま残る', async () => {
    await addIngredient('謎A')
    resetSources()
    const job = (await start()).body
    const stopped = await api.call<EstimateJob>('POST', `/recipes/attributes/jobs/${job.id}/stop`)
    expect(stopped.body.status).toBe('stopped')
    await api.workflow.settled()
    expect(await current()).toMatchObject({ status: 'stopped', rounds: 0 })
    // AI に聞く前に止まったので、食材は取り込みのまま
    const row = api.sqlite.prepare('SELECT attributes_source FROM ingredients').get() as { attributes_source: null }
    expect(row.attributes_source).toBeNull()
  })

  it('AI が失敗したらリトライし、直れば最後まで進める', async () => {
    const flaky = flakyAi(TEST_STEP_RETRIES - 1)
    api = createTestApi({ workflow: { ai: flaky.ai } })
    await addIngredient('謎A')
    resetSources()
    await start()
    await api.workflow.settled()
    expect(await current()).toMatchObject({ status: 'done' })
    expect(flaky.calls()).toBe(TEST_STEP_RETRIES)
  })

  it('リトライしてもだめなら失敗にし、理由とそれまでの件数を残す', async () => {
    const flaky = flakyAi(Number.POSITIVE_INFINITY)
    api = createTestApi({ workflow: { ai: flaky.ai } })
    await addIngredient('グラニュー糖', 'seasoning', 'g')
    await addIngredient('謎A')
    resetSources()
    await start()
    await api.workflow.settled()
    const job = await current()
    expect(job).toMatchObject({ status: 'failed', error: 'AI の応答がありませんでした' })
    // 1 回目の途中（辞書で決まった分）は保存されている
    const sugar = api.sqlite.prepare("SELECT attributes_source FROM ingredients WHERE name = 'グラニュー糖'").get() as {
      attributes_source: string
    }
    expect(sugar.attributes_source).toBe('rule')
    expect(flaky.calls()).toBe(TEST_STEP_RETRIES + 1)
  })

  it('古い目安を見直すも同じジョブで、最初の 1 回だけ古い価格を消して入れ直す', async () => {
    const pork = await addIngredient('豚こま切れ肉', 'meat', 'g')
    api.sqlite.exec(
      `UPDATE ingredients SET price_yen = 1, price_source = 'default', price_updated_at = '2020-01-01T00:00:00.000Z' WHERE id = '${pork.id}'`,
    )
    const res = await start({ refreshStalePrices: true })
    expect(res.body.refreshStalePrices).toBe(true)
    await api.workflow.settled()
    expect(await current()).toMatchObject({ status: 'done', progress: { prices: { updated: 1, remaining: 0 } } })
    expect((await api.call<Ingredient>('GET', `/ingredients/${pork.id}`)).body.priceYen).toBe(150)
  })

  it('実行中なのにサーバー側のジョブが終わっていたら、失敗にして次を始められるようにする', async () => {
    await addIngredient('謎A')
    resetSources()
    const job = (await start()).body
    api.workflow.setStatus(job.id, 'errored')
    expect(await current()).toMatchObject({ id: job.id, status: 'failed' })
    expect((await current())?.error).toContain('途中で止まりました')
    await api.workflow.settled()
    // 失敗のあとに裏で回が進んでも、失敗のまま
    expect(await current()).toMatchObject({ status: 'failed' })
  })

  describe('サーバー側のジョブの状態を読めないとき', () => {
    /** インスタンスなしで、実行中のジョブの行だけを作る（updated_at は ms 前） */
    const insertRunning = (agoMs: number) => {
      const at = new Date(Date.now() - agoMs).toISOString()
      api.sqlite
        .prepare(
          "INSERT INTO estimate_jobs (id, status, progress, created_at, updated_at) VALUES ('j1', 'running', '{}', ?, ?)",
        )
        .run(at, at)
    }

    it('一時的に読めないだけなら実行中のまま', async () => {
      insertRunning(60_000)
      api.workflow.failGet('network connection lost')
      expect(await current()).toMatchObject({ id: 'j1', status: 'running' })
    })

    it('読めないまま長く更新されていなければ失敗にする', async () => {
      insertRunning(STALE_JOB_MS + 60_000)
      api.workflow.failGet('network connection lost')
      expect(await current()).toMatchObject({ id: 'j1', status: 'failed' })
    })

    it('インスタンスが見つからなければすぐ失敗にする', async () => {
      insertRunning(60_000)
      api.workflow.failGet('instance.not_found')
      expect(await current()).toMatchObject({ id: 'j1', status: 'failed' })
    })
  })

  it('回を進めるたびと終わったときに updatedAt が進む', async () => {
    await addIngredient('謎A')
    resetSources()
    const job = (await start()).body
    api.sqlite.prepare("UPDATE estimate_jobs SET updated_at = '2000-01-01T00:00:00.000Z' WHERE id = ?").run(job.id)
    await api.workflow.settled()
    const done = await current()
    expect(done?.status).toBe('done')
    expect(done?.updatedAt).not.toBe('2000-01-01T00:00:00.000Z')
    expect(done?.finishedAt).not.toBeNull()
  })

  it('設定がない・入力が悪い失敗はリトライしない。AI の一時的な 503 はリトライする', () => {
    expect(isPermanentJobError(new ApiError(503, 'AI_NOT_CONFIGURED', 'no key'))).toBe(true)
    expect(isPermanentJobError(new ApiError(400, 'BAD_REQUEST', 'bad'))).toBe(true)
    expect(isPermanentJobError(new ApiError(503, 'AI_UNAVAILABLE', 'starting'))).toBe(false)
    expect(isPermanentJobError(new ApiError(503, 'AI_STARTING', 'starting'))).toBe(false)
    expect(isPermanentJobError(new AiError('timeout'))).toBe(false)
  })

  it('ジョブがなければ null。Workflow の設定がなければ 503', async () => {
    expect(await current()).toBeNull()
    api = createTestApi({ env: { ESTIMATE_WORKFLOW: undefined } })
    const res = await start()
    expect(res.status).toBe(503)
    expect(res.body.error?.code).toBe('JOB_NOT_CONFIGURED')
  })
})
