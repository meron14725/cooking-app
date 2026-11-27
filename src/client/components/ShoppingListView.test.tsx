// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ShoppingItem, ShoppingList } from '../../shared/schemas/shopping'
import { mockApi, renderRoutes } from '../testing/render'
import { ShoppingListView } from './ShoppingListView'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const pork: ShoppingItem = {
  id: 's1',
  ingredientId: 'pork',
  name: '豚こま切れ肉',
  unit: 'g',
  category: 'meat',
  needQuantity: 150,
  packageUnitId: 'p200',
  packageLabel: '200gパック',
  packageCount: 1,
  buyQuantity: 200,
  checkedAt: '2026-11-27T10:00:00.000Z',
  isManual: false,
  usedFor: ['豚キャベツ鍋'],
  estimatedYen: 300,
  packageUnits: [{ id: 'p200', label: '200gパック', quantity: 200 }],
  paidYen: null,
}

const list = (item: ShoppingItem): ShoppingList => ({
  planId: 'plan1',
  items: [item],
  cost: {
    buyYen: item.paidYen ?? 300,
    fromFridgeYen: 0,
    leftoverYen: 80,
    leftoverPerishableYen: 80,
    eatYen: 230,
    perMealYen: 250,
    totalMeals: 1,
    unpriced: [],
    unpricedCount: 0,
    hasUnpriced: false,
    remainingYen: 0,
  },
})

describe('買い物リストの払った金額', () => {
  it('行を開いて払った金額を入れると PUT で送り、入れた金額を行に出す', async () => {
    let current = pork
    const fetch = mockApi((path, body) => {
      if (path === '/shopping-items/s1/paid') {
        current = { ...current, paidYen: (body as { paidYen: number | null }).paidYen }
        return current
      }
      return list(current)
    })
    renderRoutes({ '/': <ShoppingListView planId="plan1" /> }, '/')
    fireEvent.click(await screen.findByRole('button', { name: '豚こま切れ肉を直す' }))
    fireEvent.change(screen.getByLabelText('払った金額（円）'), { target: { value: '280' } })
    fireEvent.click(screen.getByRole('button', { name: '金額を保存' }))

    await waitFor(() => expect(fetch.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(true))
    const put = fetch.mock.calls.find(([, init]) => init?.method === 'PUT')
    expect(String(put?.[0])).toContain('/shopping-items/s1/paid')
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({ paidYen: 280 })
    expect(await screen.findByText(/払った 280 円/)).toBeTruthy()
  })

  it('空にして保存すると null で消す。小数は送らない', async () => {
    const fetch = mockApi((path) => (path === '/shopping-items/s1/paid' ? pork : list({ ...pork, paidYen: 280 })))
    renderRoutes({ '/': <ShoppingListView planId="plan1" /> }, '/')
    fireEvent.click(await screen.findByRole('button', { name: '豚こま切れ肉を直す' }))
    const input = screen.getByLabelText('払った金額（円）')
    expect(input).toHaveProperty('value', '280')

    fireEvent.change(input, { target: { value: '1.5' } })
    fireEvent.click(screen.getByRole('button', { name: '金額を保存' }))
    expect(screen.getByText('金額は 0 以上の整数で入れてください')).toBeTruthy()

    fireEvent.change(input, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: '金額を保存' }))
    await waitFor(() => expect(fetch.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(true))
    const put = fetch.mock.calls.find(([, init]) => init?.method === 'PUT')
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({ paidYen: null })
  })
})
