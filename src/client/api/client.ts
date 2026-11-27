/** API のエラー形式（docs/design/04-api.md） */
export type ApiErrorBody = { error?: { code?: string; message?: string; details?: unknown } }

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

/** ログインが切れたとき（401、または Access のログイン画面へのリダイレクト）に投げる */
export const UNAUTHENTICATED = 'UNAUTHENTICATED'
export const AUTH_EXPIRED_EVENT = 'cooking-app:auth-expired'

export function isAuthError(err: unknown): boolean {
  return err instanceof ApiRequestError && err.code === UNAUTHENTICATED
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const res = await fetch(`/api${path}`, {
    ...init,
    headers,
    // Access のセッションが切れると、ログイン画面（別ドメイン）へリダイレクトされる。
    // 追いかけると CORS エラーになるので、リダイレクトは「ログイン切れ」として扱う
    redirect: 'manual',
  })

  if (res.type === 'opaqueredirect' || res.status === 401) {
    throw new ApiRequestError(401, UNAUTHENTICATED, 'ログインの有効期限が切れました')
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null
    throw new ApiRequestError(res.status, body?.error?.code ?? 'UNKNOWN', body?.error?.message ?? res.statusText)
  }

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
