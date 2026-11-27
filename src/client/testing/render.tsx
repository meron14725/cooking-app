import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { vi } from 'vitest'

/** 画面のテスト用: API の応答を path ごとに返す fetch を差し込む */
export function mockApi(handler: (path: string, body: unknown) => unknown) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    const json = handler(url.pathname.replace(/^\/api/, ''), body)
    return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } })
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

/** ルーターと TanStack Query を付けて描く。routes は path → 画面 */
export function renderRoutes(routes: Record<string, ReactNode>, initial: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    Object.entries(routes).map(([path, element]) => ({ path, element })),
    { initialEntries: [initial] },
  )
  return {
    router,
    ...render(
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
  }
}
