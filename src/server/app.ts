import { Hono } from 'hono'
import { todayJst } from '../shared/domain/date'
import { ApiError, handleError } from './errors'

export type AppEnv = { Bindings: Env }

export const app = new Hono<AppEnv>().basePath('/api')

app.onError(handleError)

app.notFound(() => {
  throw new ApiError(404, 'NOT_FOUND', 'API が見つかりません')
})

app.get('/health', (c) => c.json({ ok: true, today: todayJst() }))

export type AppType = typeof app
