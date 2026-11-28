import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { ESTIMATE_STAGES, type EstimateJob, type EstimateJobProgress } from '../../shared/schemas/estimateJob'
import { useEstimateJob, useStartEstimateJob, useStopEstimateJob } from '../api/estimateJobs'
import { aiErrorMessage } from '../api/recipes'
import { Button } from './form'

const STAGE_LABELS = { ingredients: '食材', storage: '日持ち', prices: '価格', recipes: 'レシピ' } as const

/**
 * 食材の分類・重さ・日持ち・価格の目安とレシピの区分・系統を「まとめて推定」する
 * （docs/design/09-recommendation-v2.md・10-cost.md・11-storage-days.md・12-estimate-jobs.md）。
 * 推定はサーバー側のジョブで最後まで進むので、画面を閉じても続く。画面はジョブの状態を読み直して出すだけ。
 * 「古い目安を見直す」は、最初の 1 回だけ 1 年より前の目安の価格を入れ直すジョブ
 */
export function EstimateAttributesPanel({ pollMs }: { pollMs?: number } = {}) {
  const qc = useQueryClient()
  const { data: job, isPending } = useEstimateJob(pollMs)
  const startJob = useStartEstimateJob()
  const stopJob = useStopEstimateJob()

  // 実行中から終わりに変わったら、推定した値を使う画面を読み直す
  const previous = useRef<EstimateJob['status'] | undefined>(undefined)
  useEffect(() => {
    const status = job?.status
    if (previous.current === 'running' && status !== 'running') {
      void qc.invalidateQueries({ queryKey: ['recipes'] })
      void qc.invalidateQueries({ queryKey: ['ingredients'] })
      void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'plans' && q.queryKey[2] === 'recommendations' })
    }
    previous.current = status
  }, [job?.status, qc])

  const running = job?.status === 'running'
  const startError = startJob.error && !startJob.isPending ? aiErrorMessage(startJob.error) : null
  return (
    <section className="space-y-3 rounded-card bg-surface p-4 shadow-card">
      <div>
        <h2 className="font-bold">分類と価格をまとめて推定</h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">
          食材の分類と 1
          つあたりの重さ、日持ちと保存場所、価格の目安、レシピの区分（主菜・副菜など）と味の系統を、名前と材料から決めます。
          決まらないものだけ AI に聞きます。手で直したものは変えません。献立の提案と金額に使います。
          サーバーで最後まで進めるので、画面を閉じても続きます。
        </p>
      </div>
      {job && <p className="text-sm">{statusText(job)}</p>}
      {job?.status === 'failed' && job.error && <p className="text-sm text-danger">{job.error}</p>}
      {startError && <p className="text-sm text-danger">{startError}</p>}
      {running ? (
        <Button variant="secondary" onClick={() => stopJob.mutate(job.id)} disabled={stopJob.isPending}>
          止める
        </Button>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => startJob.mutate({})} disabled={isPending || startJob.isPending}>
            {job ? 'もう一度推定する' : '推定を始める'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => startJob.mutate({ refreshStalePrices: true })}
            disabled={isPending || startJob.isPending}
          >
            古い目安を見直す
          </Button>
        </div>
      )}
      {!running && (
        <p className="text-xs leading-relaxed text-ink-muted">
          「古い目安を見直す」は、1 年より前に自動で入れた価格を消して入れ直します。手で入れた価格は残ります。
        </p>
      )}
    </section>
  )
}

const counts = (p: EstimateJobProgress, pick: (s: EstimateJobProgress[keyof EstimateJobProgress]) => number) =>
  ESTIMATE_STAGES.map((s) => `${STAGE_LABELS[s]} ${pick(p[s])} 件`).join('、')

function statusText(job: EstimateJob): string {
  const done = `${counts(job.progress, (s) => s.updated)}を直しました`
  const known = ESTIMATE_STAGES.every((s) => job.progress[s].remaining !== null)
  const rest = known ? `。残りは${counts(job.progress, (s) => s.remaining ?? 0)}です` : ''
  switch (job.status) {
    case 'running':
      return job.rounds > 0 ? `推定しています… ${done}${rest}` : '推定しています…'
    case 'done':
      return `${done}。すべて終わりました`
    case 'stopped':
      return `止めました。${done}${rest}`
    case 'failed':
      return `途中で止まりました。${done}${rest}`
  }
}
