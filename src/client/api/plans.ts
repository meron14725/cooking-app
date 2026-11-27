import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  Plan,
  PlanCreateInput,
  PlanRecipesInput,
  ProposalView,
  RecommendationsResponse,
} from '../../shared/schemas/plan'
import { apiFetch } from './client'

const keys = {
  current: ['plans', 'current'] as const,
  recommendations: (id: string, exclude: string[][] = []) => ['plans', id, 'recommendations', exclude] as const,
  evaluation: (id: string) => ['plans', id, 'evaluation'] as const,
}

export function useCurrentPlan() {
  return useQuery({
    queryKey: keys.current,
    queryFn: () => apiFetch<{ plan: Plan | null }>('/plans/current'),
    select: (d) => d.plan,
  })
}

/**
 * 提案は保存しない計算結果。在庫やレシピが変わったら取り直す。
 * exclude はもう出した案（「別の案を出す」）。それを除いた次の案が返る。
 * fixed は鍵で固定した料理と食数。必ず含めて残りを選び直す
 */
export function useRecommendations(
  planId: string | undefined,
  exclude: string[][] = [],
  fixed: { recipeId: string; servings: number }[] = [],
  enabled = true,
) {
  return useQuery({
    queryKey: [...keys.recommendations(planId ?? '', exclude), fixed] as const,
    queryFn: () =>
      apiFetch<RecommendationsResponse>(`/plans/${planId}/recommendations`, {
        method: 'POST',
        body: JSON.stringify({
          ...(exclude.length > 0 ? { exclude } : {}),
          ...(fixed.length > 0 ? { fixed } : {}),
        }),
      }),
    enabled: Boolean(planId) && enabled,
  })
}

export function usePlanEvaluation(planId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: keys.evaluation(planId ?? ''),
    queryFn: () => apiFetch<ProposalView>(`/plans/${planId}/evaluation`),
    enabled: Boolean(planId) && enabled,
  })
}

/**
 * 提案カードで食分を変えた案を評価し直す（保存しない）。recipes が null の案は取らない。
 * 押している間は前の結果を出したままにする
 */
export function useProposalEvaluations(planId: string, list: (PlanRecipesInput['recipes'] | null)[]) {
  return useQueries({
    queries: list.map((recipes, i) => ({
      // 取らない案もキーが重ならないように、番号を入れる
      queryKey: ['plans', planId, 'proposal-evaluation', recipes ?? i] as const,
      queryFn: () =>
        apiFetch<ProposalView>(`/plans/${planId}/evaluation`, { method: 'POST', body: JSON.stringify({ recipes }) }),
      enabled: recipes !== null,
      placeholderData: keepPreviousData,
    })),
  })
}

function useSetCurrent() {
  const qc = useQueryClient()
  return async (plan: Plan | null) => {
    qc.setQueryData(keys.current, { plan })
    const others = {
      queryKey: ['plans'],
      predicate: (q: { queryKey: readonly unknown[] }) => q.queryKey[1] !== 'current',
    }
    // 確定・破棄の後は提案や評価を取り直さない（draft 以外では 409 になる）
    if (plan?.status === 'draft') await qc.invalidateQueries(others)
    else qc.removeQueries(others)
  }
}

export function useCreatePlan() {
  const setCurrent = useSetCurrent()
  return useMutation({
    mutationFn: (input: PlanCreateInput) => apiFetch<Plan>('/plans', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: setCurrent,
  })
}

export function useReplacePlanRecipes(planId: string) {
  const setCurrent = useSetCurrent()
  return useMutation({
    mutationFn: (input: PlanRecipesInput) =>
      apiFetch<Plan>(`/plans/${planId}/recipes`, { method: 'PUT', body: JSON.stringify(input) }),
    onSuccess: setCurrent,
  })
}

export function useConfirmPlan(planId: string) {
  const setCurrent = useSetCurrent()
  return useMutation({
    mutationFn: (startsOn: string) =>
      apiFetch<Plan>(`/plans/${planId}/confirm`, { method: 'POST', body: JSON.stringify({ startsOn }) }),
    onSuccess: setCurrent,
  })
}

export function useDeletePlan() {
  const setCurrent = useSetCurrent()
  return useMutation({
    mutationFn: (planId: string) => apiFetch<void>(`/plans/${planId}`, { method: 'DELETE' }),
    onSuccess: () => setCurrent(null),
  })
}
