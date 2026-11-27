import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { StorageLocation } from '../../shared/schemas/ingredient'
import type {
  FridgeEntry,
  InventoryCreateInput,
  InventoryItem,
  InventoryPatchInput,
} from '../../shared/schemas/inventory'
import { apiFetch } from './client'

export type FridgeFilter = { location?: StorageLocation; kind?: FridgeEntry['kind']; expiringSoon?: boolean }

const keys = {
  inventory: ['inventory'] as const,
  fridge: (f: FridgeFilter) => ['fridge', f] as const,
}

export function useFridge(filter: FridgeFilter = {}) {
  const search = new URLSearchParams()
  if (filter.location) search.set('location', filter.location)
  if (filter.kind) search.set('kind', filter.kind)
  if (filter.expiringSoon) search.set('expiringSoon', 'true')
  const qs = search.toString()
  return useQuery({
    queryKey: keys.fridge(filter),
    queryFn: () => apiFetch<{ items: FridgeEntry[] }>(`/fridge${qs ? `?${qs}` : ''}`),
    select: (d) => d.items,
  })
}

export function useInventory() {
  return useQuery({
    queryKey: keys.inventory,
    queryFn: () => apiFetch<{ items: InventoryItem[] }>('/inventory'),
    select: (d) => d.items,
  })
}

function useInvalidateStock() {
  const qc = useQueryClient()
  return () =>
    Promise.all([qc.invalidateQueries({ queryKey: ['inventory'] }), qc.invalidateQueries({ queryKey: ['fridge'] })])
}

export function useAddInventory() {
  const invalidate = useInvalidateStock()
  return useMutation({
    mutationFn: (input: InventoryCreateInput) =>
      apiFetch<InventoryItem>('/inventory', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: invalidate,
  })
}

export function useUpdateInventory() {
  const invalidate = useInvalidateStock()
  return useMutation({
    mutationFn: ({ id, ...input }: InventoryPatchInput & { id: string }) =>
      apiFetch<InventoryItem | undefined>(`/inventory/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: invalidate,
  })
}

export function useUseUpInventory() {
  const invalidate = useInvalidateStock()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/inventory/${id}/use-up`, { method: 'POST' }),
    onSuccess: invalidate,
  })
}
