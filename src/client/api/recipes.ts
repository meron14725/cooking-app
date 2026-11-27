import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Recipe, RecipeInput, RecipeSort, RecipeSummary } from '../../shared/schemas/recipe'
import type { EstimateCaloriesInput, RecipeDraft, SuggestRecipeInput } from '../../shared/schemas/recipeDraft'
import { ApiRequestError, apiFetch } from './client'

const keys = {
  all: ['recipes'] as const,
  list: (params: RecipeListParams) => ['recipes', 'list', params] as const,
  detail: (id: string) => ['recipes', 'detail', id] as const,
}

type RecipeListParams = { q?: string; ingredientId?: string; sort?: RecipeSort }

export function useRecipes(params: RecipeListParams = {}) {
  const search = new URLSearchParams()
  if (params.q) search.set('q', params.q)
  if (params.ingredientId) search.set('ingredientId', params.ingredientId)
  if (params.sort) search.set('sort', params.sort)
  const qs = search.toString()
  return useQuery({
    queryKey: keys.list(params),
    queryFn: () => apiFetch<{ items: RecipeSummary[] }>(`/recipes${qs ? `?${qs}` : ''}`),
    select: (d) => d.items,
  })
}

export function useRecipe(id: string | undefined) {
  return useQuery({
    queryKey: keys.detail(id ?? ''),
    queryFn: () => apiFetch<Recipe>(`/recipes/${id}`),
    enabled: Boolean(id),
  })
}

export function useSaveRecipe(id: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: RecipeInput) =>
      apiFetch<Recipe>(id ? `/recipes/${id}` : '/recipes', {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: (saved) => {
      qc.setQueryData(keys.detail(saved.id), saved)
      return Promise.all([
        qc.invalidateQueries({ queryKey: keys.all }),
        // レシピが増えたり変わったりしたら献立の提案を計算し直す
        qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'plans' && q.queryKey[2] === 'recommendations' }),
      ])
    },
  })
}

export function useDeleteRecipe() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/recipes/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  })
}

/** AI の呼び出しは画面側でも 90 秒で打ち切る（docs/design/08-agent.md「AI プロバイダ」。サーバ側は 75 秒 + ページ取得 10 秒） */
const AI_TIMEOUT_MS = 90_000

export function useImportRecipe() {
  return useMutation({
    mutationFn: (url: string) =>
      apiFetch<RecipeDraft>('/recipes/import-url', {
        method: 'POST',
        body: JSON.stringify({ url }),
        signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      }),
  })
}

/** 「＋」のパネル: URL・メモ・料理名など何でも送って下書きを作らせる（保存しない）。signal で取りやめられる */
export function useDraftRecipe() {
  return useMutation({
    mutationFn: ({ text, signal }: { text: string; signal?: AbortSignal }) =>
      apiFetch<RecipeDraft>('/recipes/draft', {
        method: 'POST',
        body: JSON.stringify({ text }),
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(AI_TIMEOUT_MS)])
          : AbortSignal.timeout(AI_TIMEOUT_MS),
      }),
  })
}

/** 余りそうな食材から AI に 1 品の下書きを作らせる（保存しない） */
export function useSuggestRecipe() {
  return useMutation({
    mutationFn: (input: SuggestRecipeInput) =>
      apiFetch<RecipeDraft>('/recipes/suggest', {
        method: 'POST',
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      }),
  })
}

export function useEstimateCalories() {
  return useMutation({
    mutationFn: (input: EstimateCaloriesInput) =>
      apiFetch<{ caloriesKcal: number }>('/recipes/estimate-calories', {
        method: 'POST',
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      }),
  })
}

/** AI 呼び出しの失敗を画面向けの文にする */
export function aiErrorMessage(err: unknown): string {
  if (err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
    return '時間がかかりすぎたので打ち切りました。もう一度試してください'
  }
  if (err instanceof ApiRequestError) return err.message
  return 'うまくいきませんでした。もう一度試してください'
}
