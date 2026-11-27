// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Recipe } from '../../shared/schemas/recipe'
import { mockApi, renderRoutes } from '../testing/render'
import { RecipeEditPage } from './RecipeEditPage'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const onion = {
  id: 'onion',
  name: '玉ねぎ',
  aliases: [],
  category: 'vegetable',
  unit: '個',
  gramsPerUnit: 200,
  canFreeze: true,
  fridgeDays: 30,
  freezerDays: null,
  pantryDays: 30,
  preppedFridgeDays: null,
  preppedFreezerDays: null,
  defaultLocation: 'pantry',
  beforeCookTask: null,
  frozenCookNote: null,
  isStaple: false,
  packageUnits: [],
}

function recipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: 'r1',
    title: '玉ねぎの煮物',
    servings: 2,
    caloriesKcal: null,
    caloriesEstimated: false,
    hotcookMode: null,
    maxServings1_6l: 4,
    packSeasonings: false,
    sourceType: 'manual',
    sourceUrl: null,
    notes: null,
    officialMenuNo: null,
    imageKey: null,
    favoriteCount: null,
    isFavorite: false,
    cookCount: null,
    score: null,
    dishType: 'side',
    cuisine: 'japanese',
    usesMixingUnit: null,
    cookMinutes: 30,
    attributesSource: 'rule',
    ingredients: [
      {
        id: 'ri1',
        ingredientId: 'onion',
        ingredientName: '玉ねぎ',
        unit: '個',
        quantity: 1,
        displayText: '玉ねぎ 1個',
        cutStyle: null,
        addOrder: 0,
      },
    ],
    steps: [],
    updatedAt: '2026-11-27T00:00:00Z',
    ...overrides,
  }
}

function setup(r: Recipe) {
  const saved: unknown[] = []
  mockApi((path, body) => {
    if (path === '/ingredients') return { items: [onion] }
    if (path === '/recipes/r1') {
      if (body) {
        saved.push(body)
        return r
      }
      return r
    }
    return { items: [] }
  })
  renderRoutes({ '/recipes/:id/edit': <RecipeEditPage />, '/recipes/:id': <p>見るページ</p> }, '/recipes/r1/edit')
  return saved
}

describe('レシピの編集: 分類', () => {
  it('今の区分・系統と、どう決めたかを出す', async () => {
    setup(recipe())
    expect(await screen.findByLabelText('区分')).toHaveProperty('value', 'side')
    expect(screen.getByLabelText('味の系統')).toHaveProperty('value', 'japanese')
    expect(screen.getByLabelText(/調理時間/)).toHaveProperty('value', '30')
    expect(screen.getByText('料理名と材料から自動で決めました')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '自動に戻す' })).toBeNull()
  })

  it('触らずに保存したら分類は送らない（サーバが決める）', async () => {
    const saved = setup(recipe())
    await screen.findByLabelText('区分')
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(saved).toHaveLength(1))
    expect(saved[0]).not.toHaveProperty('attributesManual')
    expect(saved[0]).not.toHaveProperty('dishType')
  })

  it('直して保存したら、値と手で設定した印を送る', async () => {
    const saved = setup(recipe())
    fireEvent.change(await screen.findByLabelText('区分'), { target: { value: 'main' } })
    fireEvent.change(screen.getByLabelText('まぜ技ユニット'), { target: { value: 'no' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(saved).toHaveLength(1))
    expect(saved[0]).toMatchObject({
      dishType: 'main',
      cuisine: 'japanese',
      usesMixingUnit: false,
      cookMinutes: 30,
      attributesManual: true,
    })
  })

  it('1 つだけ直したら、空の欄は送らない（サーバがルールで決める）', async () => {
    const saved = setup(recipe({ cuisine: null, cookMinutes: null }))
    fireEvent.change(await screen.findByLabelText('区分'), { target: { value: 'main' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(saved).toHaveLength(1))
    expect(saved[0]).toMatchObject({ dishType: 'main', attributesManual: true })
    expect(saved[0]).not.toHaveProperty('cuisine')
    expect(saved[0]).not.toHaveProperty('usesMixingUnit')
    expect(saved[0]).not.toHaveProperty('cookMinutes')
  })

  it('手で設定したレシピは「自動に戻す」で自動に戻せる', async () => {
    const saved = setup(recipe({ attributesSource: 'manual' }))
    expect(await screen.findByText('手で設定しました')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('区分'), { target: { value: 'soup' } })
    fireEvent.click(screen.getByRole('button', { name: '自動に戻す' }))
    // 欄は保存されている値に戻る
    expect(screen.getByLabelText('区分')).toHaveProperty('value', 'side')
    expect(screen.getByText('保存すると、料理名と材料から自動で決め直します')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(saved).toHaveLength(1))
    expect(saved[0]).toMatchObject({ attributesManual: false })
    expect(saved[0]).not.toHaveProperty('dishType')
  })
})
