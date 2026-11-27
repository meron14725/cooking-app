// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ShoppingCost } from '../../shared/domain/cost'
import { mockApi, renderRoutes } from '../testing/render'
import { ProposalCost, ShoppingCostSummary } from './CostSummary'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const cost: ShoppingCost = {
  buyYen: 2380,
  fromFridgeYen: 320,
  leftoverYen: 520,
  leftoverPerishableYen: 180,
  eatYen: 2180,
  perMealYen: 390,
  totalMeals: 6,
  unpriced: [
    { ingredientId: 'i1', name: 'パクチー' },
    { ingredientId: 'i2', name: 'ナンプラー' },
  ],
  unpricedCount: 2,
  hasUnpriced: true,
  remainingYen: 1520,
}

describe('推定金額の表示', () => {
  it('提案カード: 金額にはいつも「約」を付け、未設定の品数を別に出す', () => {
    mockApi(() => ({}))
    renderRoutes({ '/': <ProposalCost cost={{ ...cost, hasUnpriced: false, unpriced: [], unpricedCount: 0 }} /> }, '/')
    expect(screen.getByText('約 2,380 円').parentElement?.textContent).toBe('約 2,380 円 · 1 食 約 390 円')
    cleanup()
    renderRoutes({ '/': <ProposalCost cost={cost} /> }, '/')
    expect(screen.getByText('（2 品未設定）')).toBeTruthy()
  })

  it('買い物リスト: 今回買う分・あと・1 食あたり・冷蔵庫から・余り。未設定は開くと食材の編集へのリンク', () => {
    mockApi(() => ({}))
    renderRoutes({ '/': <ShoppingCostSummary cost={cost} /> }, '/')
    const summary = screen.getByRole('region', { name: '推定金額' })
    expect(summary.textContent).toContain('約 2,380 円今回買う分（あと 約 1,520 円）')
    expect(summary.textContent).toContain('1 食あたり 約 390 円（6 食・調味料など 20 円込み）')
    expect(summary.textContent).toContain('冷蔵庫から 約 320 円分 ・ 余り 約 520 円分（うち傷みやすい 約 180 円）')

    fireEvent.click(screen.getByRole('button', { name: /2 品は価格未設定/ }))
    expect(screen.getByRole('link', { name: 'パクチー' }).getAttribute('href')).toBe('/ingredients/i1')
  })
})
