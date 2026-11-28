import { z } from 'zod'
import type { StageProgress } from './attributes'

/**
 * 「分類と価格をまとめて推定」のジョブ（docs/design/12-estimate-jobs.md）。
 * サーバー側（Cloudflare Workflows）で最後まで進め、状態と件数を D1 に残す。画面はそれを読み直して出すだけ
 */
export const ESTIMATE_JOB_STATUSES = ['running', 'done', 'stopped', 'failed'] as const
export type EstimateJobStatus = (typeof ESTIMATE_JOB_STATUSES)[number]

/** 段の順（食材の分類 → 日持ち → 価格 → レシピ） */
export const ESTIMATE_STAGES = ['ingredients', 'storage', 'prices', 'recipes'] as const
export type EstimateStage = (typeof ESTIMATE_STAGES)[number]

/** updated はジョブ全体で直した件数の合計、remaining は最後の 1 回のあとの残り（まだ 1 回も進んでいなければ null） */
export type EstimateJobProgress = Record<EstimateStage, { updated: number; remaining: number | null }>

export type EstimateJob = {
  id: string
  status: EstimateJobStatus
  refreshStalePrices: boolean
  progress: EstimateJobProgress
  /** API を何回分進めたか */
  rounds: number
  /** 失敗・止めた理由（ふつうは null） */
  error: string | null
  createdAt: string
  updatedAt: string
  finishedAt: string | null
}

export const startEstimateJobInputSchema = z.object({
  /** 1 回で AI に聞く件数 */
  limit: z.number().int().min(1).max(40).default(20),
  /** 最初の 1 回だけ、1 年より前の目安の価格を未設定に戻してから推定する（docs/design/10-cost.md） */
  refreshStalePrices: z.boolean().default(false),
})
export type StartEstimateJobInput = z.input<typeof startEstimateJobInputSchema>

/** Workflow に渡す値 */
export type EstimateJobParams = { jobId: string; limit: number; refreshStalePrices: boolean }

export const emptyProgress = (): EstimateJobProgress => ({
  ingredients: { updated: 0, remaining: null },
  storage: { updated: 0, remaining: null },
  prices: { updated: 0, remaining: null },
  recipes: { updated: 0, remaining: null },
})

/** 1 回分の結果を足す */
export function addProgress(
  current: EstimateJobProgress,
  round: Record<EstimateStage, StageProgress>,
): EstimateJobProgress {
  const next = emptyProgress()
  for (const s of ESTIMATE_STAGES) {
    next[s] = { updated: current[s].updated + round[s].updated, remaining: round[s].remaining }
  }
  return next
}
