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

/** 1 回で AI に聞く件数の既定。ウェブで調べるときは 1 回が遅くなるので少なくする（docs/design/06-ai.md「ウェブ検索」） */
export const ESTIMATE_LIMIT = 20
export const RESEARCH_ESTIMATE_LIMIT = 5

export const startEstimateJobInputSchema = z.object({
  /** 1 回で AI に聞く件数。省略したら ESTIMATE_LIMIT（調べるときは RESEARCH_ESTIMATE_LIMIT） */
  limit: z.number().int().min(1).max(40).optional(),
  /** 最初の 1 回だけ、1 年より前の目安の価格を未設定に戻してから推定する（docs/design/10-cost.md） */
  refreshStalePrices: z.boolean().default(false),
  /** AI にウェブ検索で調べさせる。省略したら環境変数 AI_WEB_SEARCH（既定 on）に従う */
  webSearch: z.boolean().optional(),
})
export type StartEstimateJobInput = z.input<typeof startEstimateJobInputSchema>

/** Workflow に渡す値 */
export type EstimateJobParams = { jobId: string; limit: number; refreshStalePrices: boolean; webSearch: boolean }

/** 省略した limit と webSearch を決める。webSearchByDefault は環境変数 AI_WEB_SEARCH から */
export function resolveEstimateOptions(
  input: { limit?: number; webSearch?: boolean },
  webSearchByDefault: boolean,
): { limit: number; webSearch: boolean } {
  const webSearch = input.webSearch ?? webSearchByDefault
  return { webSearch, limit: input.limit ?? (webSearch ? RESEARCH_ESTIMATE_LIMIT : ESTIMATE_LIMIT) }
}

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

/**
 * 状態が分からないまま（Workflow の読み失敗・unknown）、ジョブの行がこれだけ更新されていなければ止まったとみなす。
 * 1 回分は step の時間切れ 10 分 × (1 + リトライ 3 回) と待ち時間で 45 分ほどかかりうるので、それより長く
 */
export const STALE_JOB_MS = 60 * 60 * 1000

/** 画面で「しばらく進んでいません」と出すまでの時間。ふだんの 1 回分は数十秒〜数分で終わる */
export const STUCK_HINT_MS = 10 * 60 * 1000
