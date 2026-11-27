import { Hono } from 'hono'
import type { JWTVerifyGetKey } from 'jose'
import { api } from './api'
import { accessAuth } from './auth'
import { ApiError, handleError } from './errors'

export type AppEnv = {
  Bindings: Env
  Variables: { userEmail: string | null }
}

export function createApp(options: { getJwks?: (teamDomain: string) => JWTVerifyGetKey } = {}) {
  const app = new Hono<AppEnv>()

  app.onError(handleError)

  // 画面（静的ファイル）も API も、すべて認証を通してから返す
  app.use('*', accessAuth(options.getJwks))

  app.route('/api', api)

  app.all('/api/*', () => {
    throw new ApiError(404, 'NOT_FOUND', 'API が見つかりません')
  })

  // それ以外は画面（SPA）。存在しないパスは index.html を返す（wrangler.jsonc の not_found_handling）
  app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw))

  return app
}

export const app = createApp()
