// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, renderRoutes } from '../testing/render'
import { EstimateAttributesPanel } from './EstimateAttributesPanel'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const progress = (
  ingredients: [number, number],
  recipes: [number, number],
  prices: [number, number] = [0, 0],
  storage: [number, number] = [0, 0],
) => ({
  ingredients: { updated: ingredients[0], remaining: ingredients[1] },
  storage: { updated: storage[0], remaining: storage[1] },
  prices: { updated: prices[0], remaining: prices[1] },
  recipes: { updated: recipes[0], remaining: recipes[1] },
})

describe('分類と価格をまとめて推定', () => {
  it('残りが 0 になるまで呼び続け、直した件数を足して出す', async () => {
    const replies = [
      progress([30, 20], [0, 50], [100, 40]),
      progress([20, 0], [0, 50], [20, 20]),
      progress([0, 0], [40, 10], [20, 0]),
      progress([0, 0], [10, 0]),
    ]
    const fetch = mockApi(() => replies.shift())
    renderRoutes({ '/': <EstimateAttributesPanel /> }, '/')
    fireEvent.click(screen.getByRole('button', { name: '推定を始める' }))
    expect(
      await screen.findByText('食材 50 件、日持ち 0 件、価格 140 件、レシピ 50 件を直しました。すべて終わりました'),
    ).toBeTruthy()
    expect(fetch).toHaveBeenCalledTimes(4)
    // ふつうに始めたら古い目安は見直さない
    expect(fetch.mock.calls.every(([, init]) => JSON.parse(String(init?.body)).refreshStalePrices === undefined)).toBe(
      true,
    )
    expect(screen.getByRole('button', { name: 'もう一度推定する' })).toBeTruthy()
  })

  it('止めたら次を呼ばない', async () => {
    let resolveSecond: (v: unknown) => void = () => {}
    let calls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_: unknown, init?: RequestInit) => {
        calls++
        if (calls === 1) return Response.json(progress([5, 10], [0, 3]))
        return new Promise((resolve, reject) => {
          resolveSecond = resolve
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        })
      }),
    )
    renderRoutes({ '/': <EstimateAttributesPanel /> }, '/')
    fireEvent.click(screen.getByRole('button', { name: '推定を始める' }))
    await screen.findByText(/残りは食材 10 件、日持ち 0 件、価格 0 件、レシピ 3 件です/)
    fireEvent.click(screen.getByRole('button', { name: '止める' }))
    expect(
      await screen.findByText(
        '止めました。食材 5 件、日持ち 0 件、価格 0 件、レシピ 0 件を直しました。残りは食材 10 件、日持ち 0 件、価格 0 件、レシピ 3 件です',
      ),
    ).toBeTruthy()
    resolveSecond(Response.json(progress([0, 0], [0, 0])))
    expect(calls).toBe(2)
  })

  it('失敗したら理由を出して止まる', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ error: { code: 'AI_NOT_CONFIGURED', message: 'AI の設定がありません' } }, { status: 503 }),
      ),
    )
    renderRoutes({ '/': <EstimateAttributesPanel /> }, '/')
    fireEvent.click(screen.getByRole('button', { name: '推定を始める' }))
    expect(await screen.findByText('AI の設定がありません')).toBeTruthy()
    expect(
      screen.getByText('途中で止まりました。食材 0 件、日持ち 0 件、価格 0 件、レシピ 0 件を直しました'),
    ).toBeTruthy()
  })

  it('「古い目安を見直す」は最初の 1 回だけ refreshStalePrices を付ける', async () => {
    const replies = [progress([0, 0], [0, 0], [10, 5]), progress([0, 0], [0, 0], [5, 0])]
    const fetch = mockApi(() => replies.shift())
    renderRoutes({ '/': <EstimateAttributesPanel /> }, '/')
    fireEvent.click(screen.getByRole('button', { name: '古い目安を見直す' }))
    expect(
      await screen.findByText('食材 0 件、日持ち 0 件、価格 15 件、レシピ 0 件を直しました。すべて終わりました'),
    ).toBeTruthy()
    const bodies = fetch.mock.calls.map(([, init]) => JSON.parse(String(init?.body)))
    expect(bodies).toEqual([{ refreshStalePrices: true }, {}])
  })

  it('日持ちの件数と残りも出し、日持ちが残っていれば続ける', async () => {
    const replies = [progress([0, 0], [0, 0], [0, 0], [30, 12]), progress([0, 0], [0, 0], [0, 0], [12, 0])]
    const fetch = mockApi(() => replies.shift())
    renderRoutes({ '/': <EstimateAttributesPanel /> }, '/')
    fireEvent.click(screen.getByRole('button', { name: '推定を始める' }))
    expect(
      await screen.findByText('食材 0 件、日持ち 42 件、価格 0 件、レシピ 0 件を直しました。すべて終わりました'),
    ).toBeTruthy()
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
