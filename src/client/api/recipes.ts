import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Recipe, RecipeInput, RecipeSummary } from '../../shared/schemas/recipe'
import { apiFetch } from './client'

const keys = {
  all: ['recipes'] as const,
  list: (params: { q?: string; ingredientId?: string }) => ['recipes', 'list', params] as const,
  detail: (id: string) => ['recipes', 'detail', id] as const,
}

export function useRecipes(params: { q?: string; ingredientId?: string } = {}) {
  const search = new URLSearchParams()
  if (params.q) search.set('q', params.q)
  if (params.ingredientId) search.set('ingredientId', params.ingredientId)
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
      return qc.invalidateQueries({ queryKey: keys.all })
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
