/** API のエラー形式（docs/design/04-api.md） */
export type ApiErrorBody = { error: { code: string; message: string; details?: unknown } }

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null
    throw new ApiRequestError(res.status, body?.error.code ?? 'UNKNOWN', body?.error.message ?? res.statusText)
  }
  return (await res.json()) as T
}
