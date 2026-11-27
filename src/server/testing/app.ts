import { createApp } from '../app'
import { createTestD1 } from './d1'

/** ローカル扱い（認証スキップ）の Env と、それで API を叩くヘルパー */
export function createTestApi(opts: { seed?: boolean } = {}) {
  const DB = createTestD1({ seed: opts.seed ?? false })
  const env: Env = {
    DB,
    ASSETS: { fetch: async () => new Response('') } as unknown as Fetcher,
    ACCESS_TEAM_DOMAIN: '',
    ACCESS_AUD: '',
    ENVIRONMENT: 'local',
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

  return { env, sqlite: DB.sqlite, call }
}
