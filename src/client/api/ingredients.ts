import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Category, Ingredient, IngredientInput, PriceFilter } from '../../shared/schemas/ingredient'
import { apiFetch } from './client'

type ListParams = { q?: string; category?: Category; price?: PriceFilter }

const keys = {
  all: ['ingredients'] as const,
  list: (params: ListParams) => ['ingredients', 'list', params] as const,
  detail: (id: string) => ['ingredients', 'detail', id] as const,
}

export function useIngredients(params: ListParams = {}) {
  const search = new URLSearchParams()
  if (params.q) search.set('q', params.q)
  if (params.category) search.set('category', params.category)
  if (params.price) search.set('price', params.price)
  const qs = search.toString()
  return useQuery({
    queryKey: keys.list(params),
    queryFn: () => apiFetch<{ items: Ingredient[] }>(`/ingredients${qs ? `?${qs}` : ''}`),
    select: (d) => d.items,
  })
}

export function useIngredient(id: string | undefined) {
  return useQuery({
    queryKey: keys.detail(id ?? ''),
    queryFn: () => apiFetch<Ingredient>(`/ingredients/${id}`),
    enabled: Boolean(id),
  })
}

export function useSaveIngredient(id: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: IngredientInput) =>
      apiFetch<Ingredient>(id ? `/ingredients/${id}` : '/ingredients', {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: (saved) => {
      qc.setQueryData(keys.detail(saved.id), saved)
      return qc.invalidateQueries({ queryKey: keys.all })
    },
  })
}

export function useDeleteIngredient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/ingredients/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  })
}
