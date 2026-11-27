import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { KitDraft, KitLocation } from '../../shared/domain/prep'
import type { PrepView } from '../../shared/schemas/kit'
import { apiFetch } from './client'

const toBody = (locations: Record<string, KitLocation>) =>
  JSON.stringify({ kits: Object.entries(locations).map(([recipeId, location]) => ({ recipeId, location })) })

/** 下ごしらえと袋詰めの下書き。locations で袋の保存場所を変えると計算し直す */
export function usePrepPreview(planId: string, locations: Record<string, KitLocation>) {
  return useQuery({
    queryKey: ['plans', planId, 'prep', locations],
    queryFn: () => apiFetch<PrepView>(`/plans/${planId}/kits/preview`, { method: 'POST', body: toBody(locations) }),
    placeholderData: keepPreviousData,
  })
}

export function useSaveKits(planId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (locations: Record<string, KitLocation>) =>
      apiFetch<{ kits: KitDraft[] }>(`/plans/${planId}/kits`, { method: 'POST', body: toBody(locations) }),
    onSuccess: async () => {
      qc.removeQueries({ queryKey: ['plans', planId] })
      qc.setQueryData(['plans', 'current'], { plan: null })
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['inventory'] }),
        qc.invalidateQueries({ queryKey: ['fridge'] }),
      ])
    },
  })
}
