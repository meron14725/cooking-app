import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import { AUTH_EXPIRED_EVENT, isAuthError } from './api/client'
import { router } from './router'
import './index.css'

function onError(err: unknown) {
  if (isAuthError(err)) window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // ログイン切れは再試行しても直らない
      retry: (failureCount, err) => !isAuthError(err) && failureCount < 1,
    },
  },
})

const root = document.getElementById('root')
if (!root) throw new Error('#root が見つかりません')

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
