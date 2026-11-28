// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type EstimateJob, type EstimateJobStatus, STUCK_HINT_MS } from '../../shared/schemas/estimateJob'
import { mockApi, renderRoutes } from '../testing/render'
import { EstimateAttributesPanel } from './EstimateAttributesPanel'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const job = (
  status: EstimateJobStatus,
  updated: [number, number, number, number],
  remaining: [number, number, number, number] | null,
  extra: Partial<EstimateJob> = {},
): EstimateJob => {
  const stage = (i: number) => ({
    updated: updated[i] as number,
    remaining: remaining ? (remaining[i] as number) : null,
  })
  return {
    id: 'job1',
    status,
    refreshStalePrices: false,
    progress: { ingredients: stage(0), storage: stage(1), prices: stage(2), recipes: stage(3) },
    rounds: remaining ? 1 : 0,
    error: null,
    createdAt: '2026-11-28T00:00:00.000Z',
    updatedAt: new Date().toISOString(),
    finishedAt: status === 'running' ? null : '2026-11-28T00:01:00.000Z',
    ...extra,
  }
}

/** POST と GET を分けて返す（GET current は replies を順に返し、最後の 1 つを繰り返す） */
function api(replies: (EstimateJob | null)[], onPost: (path: string, body: unknown) => unknown = () => replies[0]) {
  let i = 0
  return mockApi((path, body) => {
    if (path === '/recipes/attributes/jobs/current') {
      const j = replies[Math.min(i, replies.length - 1)] ?? null
      i++
      return { job: j }
    }
    return onPost(path, body)
  })
}

/** 最初の読み込みが終わってボタンが押せるようになってから押す */
async function clickWhenEnabled(name: string) {
  const button = (await screen.findByRole('button', { name })) as HTMLButtonElement
  await waitFor(() => expect(button.disabled).toBe(false))
  fireEvent.click(button)
}

const posts = (fetch: ReturnType<typeof mockApi>) =>
  fetch.mock.calls
    .filter(([, init]) => init?.method === 'POST')
    .map(([url, init]) => ({ url: String(url), body: init?.body }))

describe('分類と価格をまとめて推定（ジョブ）', () => {
  it('始めるとサーバーにジョブを作り、終わるまで読み直して件数を出す', async () => {
    const fetch = api([
      null,
      job('running', [30, 0, 0, 0], [20, 40, 100, 50]),
      job('done', [50, 40, 140, 50], [0, 0, 0, 0]),
    ])
    renderRoutes({ '/': <EstimateAttributesPanel pollMs={10} /> }, '/')
    await clickWhenEnabled('推定を始める')
    expect(
      await screen.findByText('食材 50 件、日持ち 40 件、価格 140 件、レシピ 50 件を直しました。すべて終わりました'),
    ).toBeTruthy()
    expect(posts(fetch)).toEqual([{ url: '/api/recipes/attributes/jobs', body: '{}' }])
    expect(screen.getByRole('button', { name: 'もう一度推定する' })).toBeTruthy()
  })

  it('開き直すと、実行中のジョブの進み具合が見える。止めるとサーバーのジョブを止める', async () => {
    const running = job('running', [5, 0, 0, 0], [10, 3, 0, 2])
    const fetch = api([running], (path) =>
      path.endsWith('/stop') ? job('stopped', [5, 0, 0, 0], [10, 3, 0, 2]) : running,
    )
    renderRoutes({ '/': <EstimateAttributesPanel pollMs={60_000} /> }, '/')
    expect(
      await screen.findByText(
        '推定しています… 食材 5 件、日持ち 0 件、価格 0 件、レシピ 0 件を直しました。残りは食材 10 件、日持ち 3 件、価格 0 件、レシピ 2 件です',
      ),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '止める' }))
    await waitFor(() => expect(posts(fetch).map((p) => p.url)).toEqual(['/api/recipes/attributes/jobs/job1/stop']))
  })

  it('しばらく更新のない実行中のジョブは、固まっているかもと出し、止めると新しく始められる', async () => {
    const old = new Date(Date.now() - STUCK_HINT_MS - 60_000).toISOString()
    const stuck = job('running', [5, 0, 0, 0], [10, 3, 0, 2], { updatedAt: old })
    const stopped = job('stopped', [5, 0, 0, 0], [10, 3, 0, 2], { updatedAt: new Date().toISOString() })
    let current: EstimateJob = stuck
    const fetch = mockApi((path) => {
      if (path === '/recipes/attributes/jobs/current') return { job: current }
      if (path.endsWith('/stop')) {
        current = stopped
        return stopped
      }
      current = job('done', [1, 0, 0, 0], [0, 0, 0, 0], { id: 'job2' })
      return { ...current, status: 'running' }
    })
    renderRoutes({ '/': <EstimateAttributesPanel pollMs={60_000} /> }, '/')
    expect(await screen.findByText(/しばらく進んでいません/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '止める' }))
    await clickWhenEnabled('もう一度推定する')
    expect(await screen.findByText(/すべて終わりました/)).toBeTruthy()
    expect(screen.queryByText(/しばらく進んでいません/)).toBeNull()
    expect(posts(fetch).map((p) => p.url)).toEqual([
      '/api/recipes/attributes/jobs/job1/stop',
      '/api/recipes/attributes/jobs',
    ])
  })

  it('更新の新しい実行中のジョブには、固まっているかもとは出さない', async () => {
    api([job('running', [5, 0, 0, 0], [10, 3, 0, 2])])
    renderRoutes({ '/': <EstimateAttributesPanel pollMs={60_000} /> }, '/')
    expect(await screen.findByText(/^推定しています…/)).toBeTruthy()
    expect(screen.queryByText(/しばらく進んでいません/)).toBeNull()
  })

  it('失敗したジョブは理由とそこまでの件数を出す', async () => {
    api([job('failed', [3, 1, 0, 0], [7, 2, 5, 5], { error: 'AI の応答がありませんでした' })])
    renderRoutes({ '/': <EstimateAttributesPanel /> }, '/')
    expect(await screen.findByText('AI の応答がありませんでした')).toBeTruthy()
    expect(
      screen.getByText(/^途中で止まりました。食材 3 件、日持ち 1 件、価格 0 件、レシピ 0 件を直しました/),
    ).toBeTruthy()
  })

  it('「古い目安を見直す」は refreshStalePrices を付けてジョブを作る', async () => {
    const fetch = api([null, job('done', [0, 0, 15, 0], [0, 0, 0, 0], { refreshStalePrices: true })])
    renderRoutes({ '/': <EstimateAttributesPanel pollMs={10} /> }, '/')
    await clickWhenEnabled('古い目安を見直す')
    expect(
      await screen.findByText('食材 0 件、日持ち 0 件、価格 15 件、レシピ 0 件を直しました。すべて終わりました'),
    ).toBeTruthy()
    expect(posts(fetch).map((p) => JSON.parse(String(p.body)))).toEqual([{ refreshStalePrices: true }])
  })
})
