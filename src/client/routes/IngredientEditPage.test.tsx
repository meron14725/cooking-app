// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Ingredient } from '../../shared/schemas/ingredient'
import { mockApi, renderRoutes } from '../testing/render'
import { IngredientEditPage } from './IngredientEditPage'
import { IngredientsPage } from './IngredientsPage'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const onion: Ingredient = {
  id: 'onion',
  name: '玉ねぎ',
  aliases: [],
  category: 'vegetable',
  unit: '個',
  gramsPerUnit: 200,
  canFreeze: true,
  fridgeDays: 60,
  freezerDays: 30,
  pantryDays: 30,
  preppedFridgeDays: null,
  preppedFreezerDays: null,
  defaultLocation: 'pantry',
  beforeCookTask: null,
  frozenCookNote: null,
  isStaple: false,
  priceYen: 198,
  priceSource: 'default',
  priceUpdatedAt: '2024-01-10T00:00:00.000Z',
  packageUnits: [
    { id: 'u1', label: '1個', quantity: 1, isDefault: false },
    { id: 'u3', label: '3個入り', quantity: 3, isDefault: true },
  ],
}

describe('食材の編集の価格', () => {
  it('代表量の名前で価格を出し、出どころと古さを出す。直して保存すると価格を送る', async () => {
    const fetch = mockApi((path, body) => (path === '/ingredients/onion' && body ? { ...onion, ...body } : onion))
    renderRoutes({ '/ingredients/:id': <IngredientEditPage />, '/ingredients': <p>一覧</p> }, '/ingredients/onion')
    const input = await screen.findByLabelText(/^3個入り あたり（円）/)
    expect(input).toHaveProperty('value', '198')
    expect(screen.getByText(/目安（自動） · 2024-01-10/).textContent).toContain('1 年以上前の価格')

    // 代表を 1 個に変えると、ラベルも変わる
    fireEvent.click(screen.getAllByRole('radio', { name: '代表' })[0] as HTMLElement)
    expect(screen.getByLabelText(/^1個 あたり（円）/)).toBeTruthy()

    fireEvent.change(screen.getByLabelText(/^1個 あたり（円）/), { target: { value: '70' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(fetch.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(true))
    const put = fetch.mock.calls.find(([, init]) => init?.method === 'PUT')
    expect(JSON.parse(String(put?.[1]?.body)).priceYen).toBe(70)
  })

  it('空にすると未設定（null）で送る', async () => {
    const fetch = mockApi((_, body) => (body ? { ...onion, ...body } : onion))
    renderRoutes({ '/ingredients/:id': <IngredientEditPage />, '/ingredients': <p>一覧</p> }, '/ingredients/onion')
    fireEvent.change(await screen.findByLabelText(/^3個入り あたり（円）/), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(fetch.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(true))
    const put = fetch.mock.calls.find(([, init]) => init?.method === 'PUT')
    expect(JSON.parse(String(put?.[1]?.body)).priceYen).toBeNull()
  })
})

describe('食材一覧の価格の絞り込み', () => {
  it('「価格未設定」を押すと price=missing で取り直す。行に価格を出す', async () => {
    const fetch = mockApi(() => ({ items: [onion, { ...onion, id: 'carrot', name: '人参', priceYen: null }] }))
    renderRoutes({ '/ingredients': <IngredientsPage /> }, '/ingredients')
    expect(await screen.findByText('3個入り 198円（目安）')).toBeTruthy()
    expect(screen.getByText('価格未設定', { selector: 'div' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '価格未設定' }))
    await waitFor(() => expect(fetch.mock.calls.some(([url]) => String(url).includes('price=missing'))).toBe(true))
  })
})
