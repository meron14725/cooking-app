import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CookView, KitCookedInput, KitPatchInput, KitStatus, MealKit } from '../../shared/schemas/kit'
import { apiFetch } from './client'

/** 袋の一覧（既定は保存中）。plannedOnOrBefore で「今日の袋」（今日までに食べる予定のもの）、status で作った袋など */
export function useKits(opts: { plannedOnOrBefore?: string; status?: KitStatus } = {}) {
  const search = new URLSearchParams()
  if (opts.plannedOnOrBefore) search.set('plannedOnOrBefore', opts.plannedOnOrBefore)
  if (opts.status) search.set('status', opts.status)
  const qs = search.size > 0 ? `?${search}` : ''
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
