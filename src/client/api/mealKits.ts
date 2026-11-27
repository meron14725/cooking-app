import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CookView, KitCookedInput, KitPatchInput, MealKit } from '../../shared/schemas/kit'
import { apiFetch } from './client'

/** 保存中の袋。plannedOnOrBefore で「今日の袋」（今日までに食べる予定のもの） */
export function useKits(opts: { plannedOnOrBefore?: string } = {}) {
  const qs = opts.plannedOnOrBefore ? `?plannedOnOrBefore=${opts.plannedOnOrBefore}` : ''
  return useQuery({
    queryKey: ['kits', opts],
    queryFn: () => apiFetch<{ items: MealKit[] }>(`/kits${qs}`),
    select: (d) => d.items,
  })
}

export function useCookView(id: string) {
  return useQuery({ queryKey: ['kits', 'cook', id], queryFn: () => apiFetch<CookView>(`/kits/${id}/cook`) })
}

function useInvalidate() {
  const qc = useQueryClient()
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['kits'] }),
      qc.invalidateQueries({ queryKey: ['inventory'] }),
      qc.invalidateQueries({ queryKey: ['fridge'] }),
      qc.invalidateQueries({ queryKey: ['plans'] }),
    ])
}

export function useCookKit(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: KitCookedInput) =>
      apiFetch<MealKit>(`/kits/${id}/cooked`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: invalidate,
  })
}

export function useDiscardKit(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: () => apiFetch<MealKit>(`/kits/${id}/discard`, { method: 'POST' }),
    onSuccess: invalidate,
  })
}

export function useUpdateKit(id: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (input: KitPatchInput) =>
      apiFetch<MealKit>(`/kits/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: invalidate,
  })
}
