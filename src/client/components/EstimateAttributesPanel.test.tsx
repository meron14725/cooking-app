// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, renderRoutes } from '../testing/render'
import { EstimateAttributesPanel } from './EstimateAttributesPanel'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const progress = (ingredients: [number, number], recipes: [number, number]) => ({
  ingredients: { updated: ingredients[0], remaining: ingredients[1] },
  recipes: { updated: recipes[0], remaining: recipes[1] },
})

describe('分類をまとめて推定', () => {
  it('残りが 0 になるまで呼び続け、直した件数を足して出す', async () => {
    const replies = [progress([30, 20], [0, 50]), progress([20, 0], [40, 10]), progress([0, 0], [10, 0])]
    const fetch = mockApi(() => replies.shift())
    renderRoutes({ '/': <EstimateAttributesPanel /> }, '/')
    fireEvent.click(screen.getByRole('button', { name: '推定を始める' }))
    expect(await screen.findByText('食材 50 件、レシピ 50 件を直しました。すべて終わりました')).toBeTruthy()
    expect(fetch).toHaveBeenCalledTimes(3)
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
    await screen.findByText(/残りは食材 10 件、レシピ 3 件です/)
    fireEvent.click(screen.getByRole('button', { name: '止める' }))
    expect(
      await screen.findByText('止めました。食材 5 件、レシピ 0 件を直しました。残りは食材 10 件、レシピ 3 件です'),
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
    expect(screen.getByText('途中で止まりました。食材 0 件、レシピ 0 件を直しました')).toBeTruthy()
  })
})
