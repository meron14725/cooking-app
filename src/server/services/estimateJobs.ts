/**
 * 「分類と価格をまとめて推定」のジョブ（docs/design/12-estimate-jobs.md）。
 * ジョブの行を D1 に作り、Cloudflare Workflows のインスタンス（ID はジョブと同じ）で最後まで進める。
 * 段ごとの処理は attributes.ts の estimateAttributes をそのまま使う
 */
import { and, desc, eq } from 'drizzle-orm'
import type { EstimateAttributesResponse } from '../../shared/schemas/attributes'
import {
  addProgress,
  ESTIMATE_STAGES,
  type EstimateJob,
  type EstimateJobParams,
  type EstimateJobStatus,
  emptyProgress,
  type StartEstimateJobInput,
} from '../../shared/schemas/estimateJob'
import { ulid } from '../../shared/ulid'
import type { AiProvider } from '../ai/provider'
import type { Db } from '../db/client'
import { estimateJobs } from '../db/schema'
import { ApiError } from '../errors'
import { estimateAttributes } from './attributes'

/** ジョブを動かす Workflow のうち、使う機能だけ（テストでは偽物に差し替える） */
export type EstimateWorkflowBinding = {
  create(options: { id: string; params: EstimateJobParams }): Promise<unknown>
  get(id: string): Promise<{ status(): Promise<{ status: string }>; terminate(): Promise<void> }>
}

/** 1 回分の処理を、途中で失敗してもやり直せる単位で包む（Workflows の step.do。リトライはこちらの役目） */
export type JobStep = { do<T>(name: string, fn: () => Promise<T>): Promise<T> }

/** 1 つのジョブで進める回数の上限（Workflows の 1 インスタンスの step 数の上限より十分小さく） */
export const MAX_ROUNDS = 300

type Row = typeof estimateJobs.$inferSelect

function toJob(row: Row): EstimateJob {
  return {
    id: row.id,
    status: row.status,
    refreshStalePrices: row.refreshStalePrices,
    progress: { ...emptyProgress(), ...row.progress },
    rounds: row.rounds,
    error: row.error,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    finishedAt: row.finishedAt,
  }
}

async function findJob(db: Db, id: string): Promise<EstimateJob | null> {
  const row = await db.query.estimateJobs.findFirst({ where: eq(estimateJobs.id, id) })
  return row ? toJob(row) : null
}

async function getJob(db: Db, id: string): Promise<EstimateJob> {
  const job = await findJob(db, id)
  if (!job) throw new ApiError(404, 'NOT_FOUND', 'ジョブが見つかりません')
  return job
}

/** 実行中のジョブを終わらせる。すでに終わっていれば何もしない（止めた後に完了で上書きしない） */
async function finish(db: Db, id: string, status: Exclude<EstimateJobStatus, 'running'>, error: string | null) {
  await db
    .update(estimateJobs)
    .set({ status, error, finishedAt: new Date().toISOString() })
    .where(and(eq(estimateJobs.id, id), eq(estimateJobs.status, 'running')))
}

function requireWorkflow(workflow: EstimateWorkflowBinding | undefined): EstimateWorkflowBinding {
  if (!workflow) {
    throw new ApiError(
      503,
      'JOB_NOT_CONFIGURED',
      'ジョブの設定がありません（Workflow の ESTIMATE_WORKFLOW binding が必要です）',
    )
  }
  return workflow
}

/** ジョブを作って Workflow を始める。実行中のジョブがあれば 409（同時に 1 つまで） */
export async function startEstimateJob(
  db: Db,
  workflow: EstimateWorkflowBinding | undefined,
  input: Required<StartEstimateJobInput>,
): Promise<EstimateJob> {
  const wf = requireWorkflow(workflow)
  const id = ulid()
  try {
    await db.insert(estimateJobs).values({
      id,
      status: 'running',
      refreshStalePrices: input.refreshStalePrices,
      progress: emptyProgress(),
    })
  } catch (err) {
    const running = await db.query.estimateJobs.findFirst({ where: eq(estimateJobs.status, 'running') })
    if (running) throw new ApiError(409, 'JOB_RUNNING', '推定はすでに動いています', { job: toJob(running) })
    throw err
  }
  try {
    await wf.create({ id, params: { jobId: id, limit: input.limit, refreshStalePrices: input.refreshStalePrices } })
  } catch (err) {
    await finish(db, id, 'failed', 'サーバーでジョブを始められませんでした')
    throw err
  }
  return getJob(db, id)
}

/** Workflow のインスタンスがもう動いていない状態 */
const DEAD_STATUSES = new Set(['errored', 'terminated', 'complete', 'unknown'])

/**
 * いちばん新しいジョブ。実行中なのに Workflow のインスタンスが終わっていれば（落ちた・消えた）失敗にする
 * （実行中のまま残ると、次のジョブを始められなくなるため）
 */
export async function currentEstimateJob(
  db: Db,
  workflow: EstimateWorkflowBinding | undefined,
): Promise<EstimateJob | null> {
  const row = await db.query.estimateJobs.findFirst({ orderBy: [desc(estimateJobs.createdAt), desc(estimateJobs.id)] })
  if (!row) return null
  if (row.status === 'running' && workflow) {
    const status = await workflow
      .get(row.id)
      .then((i) => i.status())
      .then((s) => s.status)
      .catch(() => 'unknown')
    if (DEAD_STATUSES.has(status)) {
      await finish(db, row.id, 'failed', 'サーバーのジョブが途中で止まりました。もう一度始めてください')
      return getJob(db, row.id)
    }
  }
  return toJob(row)
}

/** 止める。D1 を先に「止めた」にし（Workflow は次の回の前にこれを見て止まる）、インスタンスも終わらせる */
export async function stopEstimateJob(
  db: Db,
  workflow: EstimateWorkflowBinding | undefined,
  id: string,
): Promise<EstimateJob> {
  const job = await getJob(db, id)
  if (job.status !== 'running') return job
  await finish(db, id, 'stopped', null)
  await workflow
    ?.get(id)
    .then((i) => i.terminate())
    .catch(() => {})
  return getJob(db, id)
}

async function recordRound(db: Db, id: string, round: EstimateAttributesResponse) {
  const job = await getJob(db, id)
  await db
    .update(estimateJobs)
    .set({ progress: addProgress(job.progress, round), rounds: job.rounds + 1 })
    .where(eq(estimateJobs.id, id))
}

const errorMessage = (err: unknown) =>
  err instanceof Error && err.message ? err.message : '推定中にエラーが発生しました'

/**
 * ジョブを最後まで進める（Workflow の run から呼ぶ）。1 回分ごとに step.do で包み、失敗はリトライに任せる。
 * リトライしてもだめなら失敗にし、それまでの件数を残す。止めたら（D1 が running でなくなったら）次の回の前に止まる
 */
export async function runEstimateJob(
  db: Db,
  ai: () => AiProvider,
  params: EstimateJobParams,
  step: JobStep,
): Promise<EstimateJobStatus> {
  const { jobId, limit } = params
  for (let round = 0; round < MAX_ROUNDS; round++) {
    let result: EstimateAttributesResponse | null
    try {
      result = await step.do(`round-${round}`, async () => {
        const job = await findJob(db, jobId)
        if (job?.status !== 'running') return null
        // 古い目安の見直しは最初の 1 回だけ（やり直しても、入れ直したばかりの値は古くないので消えない）
        return estimateAttributes(db, ai, { limit, refreshStalePrices: params.refreshStalePrices && round === 0 })
      })
    } catch (err) {
      await step.do('fail', () => finish(db, jobId, 'failed', errorMessage(err)))
      return 'failed'
    }
    if (result === null) return 'stopped'
    const done = result
    await step.do(`record-${round}`, () => recordRound(db, jobId, done))
    if (ESTIMATE_STAGES.every((s) => done[s].remaining === 0)) {
      await step.do('done', () => finish(db, jobId, 'done', null))
      return 'done'
    }
  }
  await step.do('fail', () => finish(db, jobId, 'failed', `${MAX_ROUNDS} 回進めても終わりませんでした`))
  return 'failed'
}
