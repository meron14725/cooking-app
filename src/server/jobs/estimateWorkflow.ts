/**
 * 「分類と価格をまとめて推定」を最後まで進める Workflow（docs/design/12-estimate-jobs.md）。
 * 中身は services/estimateJobs.ts の runEstimateJob。ここは step.do のリトライの設定と、リトライしても無駄な失敗の見分けだけ。
 * cloudflare:workers を読むので、Node のテストからは import しない（index.ts だけが読む）
 */
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers'
import { NonRetryableError } from 'cloudflare:workflows'
import type { EstimateJobParams } from '../../shared/schemas/estimateJob'
import { getProvider } from '../ai'
import { createDb } from '../db/client'
import { ApiError } from '../errors'
import { runEstimateJob } from '../services/estimateJobs'

/** 1 回分（AI に limit 件聞く）のリトライ。AI の失敗はしばらく待てば直ることが多いので、間を空けて 3 回まで */
const STEP_CONFIG = {
  retries: { limit: 3, delay: '20 seconds', backoff: 'exponential' },
  timeout: '10 minutes',
} as const

/** 設定がない・入力が悪いなど、やり直しても同じ結果になる失敗 */
const isPermanent = (err: unknown) =>
  err instanceof ApiError && (err.code === 'AI_NOT_CONFIGURED' || (err.status >= 400 && err.status < 500))

export class EstimateWorkflow extends WorkflowEntrypoint<Env, EstimateJobParams> {
  async run(event: Readonly<WorkflowEvent<EstimateJobParams>>, step: WorkflowStep) {
    const env = this.env
    const db = createDb(env.DB)
    return runEstimateJob(db, () => getProvider(env), event.payload, {
      do: <T>(name: string, fn: () => Promise<T>) =>
        step.do(name, STEP_CONFIG, async () => {
          try {
            return (await fn()) as never
          } catch (err) {
            if (isPermanent(err)) throw new NonRetryableError(err instanceof Error ? err.message : String(err))
            throw err
          }
        }) as Promise<T>,
    })
  }
}
