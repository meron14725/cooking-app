import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

/** API のエラー形式: { error: { code, message, details? } }（docs/design/04-api.md） */
export class ApiError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
  }
}

export function handleError(err: Error, c: Context) {
  if (err instanceof ApiError) {
    return c.json({ error: { code: err.code, message: err.message, details: err.details } }, err.status)
  }
  if (err instanceof HTTPException) {
    return c.json({ error: { code: 'HTTP_ERROR', message: err.message } }, err.status)
  }
  console.error(err)
  return c.json({ error: { code: 'INTERNAL_ERROR', message: 'サーバーでエラーが発生しました' } }, 500)
}
