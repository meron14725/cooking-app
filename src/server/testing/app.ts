import { createApp } from '../app'
import { createTestD1 } from './d1'
import { createTestR2 } from './r2'

/** ローカル扱い（認証スキップ）の Env と、それで API を叩くヘルパー */
export function createTestApi(opts: { seed?: boolean; env?: Partial<Env> } = {}) {
  const DB = createTestD1({ seed: opts.seed ?? false })
  const env: Env = {
    DB,
    ASSETS: { fetch: async () => new Response('') } as unknown as Fetcher,
    IMAGES: createTestR2(),
    ACCESS_TEAM_DOMAIN: '',
    ACCESS_AUD: '',
    ENVIRONMENT: 'local',
    AI_PROVIDER: 'fake',
    ...opts.env,
  }
  const app = createApp()

  async function call<T = unknown>(method: string, path: string, body?: unknown) {
    const res = await app.request(
      `/api${path}`,
      {
        method,
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      env,
    )
    const text = await res.text()
    return { status: res.status, body: (text ? JSON.parse(text) : undefined) as T }
  }

  /** 生のレスポンスを返す（画像など JSON でないもの用） */
  function raw(path: string) {
    return app.request(`/api${path}`, {}, env)
  }

  return { env, sqlite: DB.sqlite, call, raw }
}
