import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Plan } from '../../shared/schemas/plan'
import type { ShoppingAddInput, ShoppingItem, ShoppingList, ShoppingPatchInput } from '../../shared/schemas/shopping'
import { apiFetch } from './client'

const listKey = (planId: string) => ['shopping', planId] as const

export function useShoppingList(planId: string) {
  return useQuery({
    queryKey: listKey(planId),
    queryFn: () => apiFetch<ShoppingList>(`/plans/${planId}/shopping`),
  })
}

/** 在庫・冷蔵庫と買い物リストを取り直す */
function useInvalidate(planId: string) {
  const qc = useQueryClient()
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: listKey(planId) }),
      qc.invalidateQueries({ queryKey: ['inventory'] }),
      qc.invalidateQueries({ queryKey: ['fridge'] }),
    ])
}

/**
 * チェック / 外す。画面は先に切り替え（楽観的更新）、失敗したら戻す。
 * サーバ側は冪等なので、リトライで二重に在庫ができることはない
 */
export function useToggleShoppingItem(planId: string) {
  const qc = useQueryClient()
  const invalidate = useInvalidate(planId)
  return useMutation({
    mutationFn: ({ id, checked }: { id: string; checked: boolean }) =>
      apiFetch<ShoppingItem>(`/shopping-items/${id}/${checked ? 'check' : 'uncheck'}`, { method: 'POST' }),
    retry: 2,
    onMutate: async ({ id, checked }) => {
      await qc.cancelQueries({ queryKey: listKey(planId) })
      const prev = qc.getQueryData<ShoppingList>(listKey(planId))
      if (prev) {
        qc.setQueryData<ShoppingList>(listKey(planId), {
          ...prev,
          items: prev.items.map((i) =>
            i.id === id ? { ...i, checkedAt: checked ? new Date().toISOString() : null } : i,
          ),
        })
      }
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(listKey(planId), ctx.prev)
    },
    onSettled: invalidate,
  })
}

export function useUpdateShoppingItem(planId: string) {
  const invalidate = useInvalidate(planId)
  return useMutation({
    mutationFn: ({ id, ...input }: ShoppingPatchInput & { id: string }) =>
      apiFetch<ShoppingItem>(`/shopping-items/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: invalidate,
  })
}

export function useAddShoppingItem(planId: string) {
  const invalidate = useInvalidate(planId)
  return useMutation({
    mutationFn: (input: ShoppingAddInput) =>
      apiFetch<ShoppingItem>(`/plans/${planId}/shopping`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: invalidate,
  })
}

export function useDeleteShoppingItem(planId: string) {
  const invalidate = useInvalidate(planId)
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/shopping-items/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
}

export function useCompleteShopping(planId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiFetch<Plan>(`/plans/${planId}/shopping/complete`, { method: 'POST' }),
    onSuccess: (plan) => qc.setQueryData(['plans', 'current'], { plan }),
  })
}
