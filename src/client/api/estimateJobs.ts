import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { EstimateJob, StartEstimateJobInput } from '../../shared/schemas/estimateJob'
import { apiFetch } from './client'

const key = ['estimate-job'] as const

/** 実行中のあいだ、ジョブの状態を読み直す間隔（ミリ秒） */
export const ESTIMATE_JOB_POLL_MS = 2000

/** いちばん新しいまとめて推定のジョブ。実行中のあいだは読み直し続ける（docs/design/12-estimate-jobs.md） */
export function useEstimateJob(pollMs = ESTIMATE_JOB_POLL_MS) {
  return useQuery({
    queryKey: key,
    queryFn: () => apiFetch<{ job: EstimateJob | null }>('/recipes/attributes/jobs/current'),
    select: (d) => d.job,
    refetchInterval: (q) => (q.state.data?.job?.status === 'running' ? pollMs : false),
  })
}

export function useStartEstimateJob() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: StartEstimateJobInput) =>
      apiFetch<EstimateJob>('/recipes/attributes/jobs', { method: 'POST', body: JSON.stringify(input) }),
    // 始められなかった（すでに動いている など）ときも、今のジョブを読み直して出す
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })
}

export function useStopEstimateJob() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<EstimateJob>(`/recipes/attributes/jobs/${id}/stop`, { method: 'POST' }),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })
}
