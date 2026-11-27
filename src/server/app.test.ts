import { exportJWK, generateKeyPair, type JWTVerifyGetKey, SignJWT } from 'jose'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp } from './app'

const TEAM = 'example.cloudflareaccess.com'
const AUD = 'test-aud'

const assets = { fetch: async () => new Response('<html>app</html>', { headers: { 'Content-Type': 'text/html' } }) }

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as D1Database,
    ASSETS: assets as unknown as Fetcher,
    IMAGES: {} as R2Bucket,
    ACCESS_TEAM_DOMAIN: TEAM,
    ACCESS_AUD: AUD,
    ...overrides,
  }
}

let privateKey: CryptoKey
let otherPrivateKey: CryptoKey
let getKey: JWTVerifyGetKey

beforeAll(async () => {
  const pair = await generateKeyPair('RS256')
  privateKey = pair.privateKey
  otherPrivateKey = (await generateKeyPair('RS256')).privateKey
  const jwk = await exportJWK(pair.publicKey)
  getKey = async () => {
    const { importJWK } = await import('jose')
    return (await importJWK(jwk, 'RS256')) as CryptoKey
  }
})

async function sign(opts: { key?: CryptoKey; aud?: string; iss?: string; exp?: string } = {}) {
  return new SignJWT({ email: 'me@example.com' })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(opts.iss ?? `https://${TEAM}`)
    .setAudience(opts.aud ?? AUD)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '5m')
    .sign(opts.key ?? privateKey)
}

function request(path: string, env: Env, token?: string) {
  const app = createApp({ getJwks: () => getKey })
  return app.request(path, { headers: token ? { 'Cf-Access-Jwt-Assertion': token } : {} }, env)
}

describe('認証（Cloudflare Access の JWT）', () => {
  it('正しい JWT なら API に届く', async () => {
    const res = await request('/api/health', makeEnv(), await sign())
    expect(res.status).toBe(200)
    expect(((await res.json()) as { ok: boolean }).ok).toBe(true)
  })

  it('正しい JWT なら画面も返す', async () => {
    const res = await request('/', makeEnv(), await sign())
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('app')
  })

  it('ヘッダがなければ 401（API は共通のエラー形式）', async () => {
    const res = await request('/api/health', makeEnv())
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: { code: 'UNAUTHENTICATED', message: 'ログインが必要です' } })
  })

  it('ヘッダがなければ画面も 401', async () => {
    const res = await request('/', makeEnv())
    expect(res.status).toBe(401)
  })

  it('ヘッダがなければレシピ写真も 401（R2 まで届かない）', async () => {
    const get = vi.fn()
    const res = await request('/api/images/img/R0001.jpg', makeEnv({ IMAGES: { get } as unknown as R2Bucket }))
    expect(res.status).toBe(401)
    expect(get).not.toHaveBeenCalled()
  })

  it.each([
    ['別の鍵で署名', { key: undefined as CryptoKey | undefined, useOtherKey: true }],
    ['aud が違う', { aud: 'other-aud' }],
    ['iss が違う', { iss: 'https://evil.cloudflareaccess.com' }],
    ['期限切れ', { exp: '-1m' }],
  ])('%s JWT は 401', async (_, opts) => {
    const { useOtherKey, ...rest } = opts as { useOtherKey?: boolean; aud?: string; iss?: string; exp?: string }
    const token = await sign({ ...rest, key: useOtherKey ? otherPrivateKey : undefined })
    const res = await request('/api/health', makeEnv(), token)
    expect(res.status).toBe(401)
  })

  it('偽のヘッダ（JWT でない文字列）は 401', async () => {
    const res = await request('/api/health', makeEnv(), 'anything')
    expect(res.status).toBe(401)
  })

  it('Access の設定が空なら、JWT があっても 503 で閉じる', async () => {
    const res = await request('/api/health', makeEnv({ ACCESS_AUD: '' }), await sign())
    expect(res.status).toBe(503)
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('AUTH_NOT_CONFIGURED')
  })

  it('ENVIRONMENT=local なら検証をスキップする', async () => {
    const res = await request('/api/health', makeEnv({ ENVIRONMENT: 'local', ACCESS_AUD: '' }))
    expect(res.status).toBe(200)
  })

  it('ENVIRONMENT が local 以外ならスキップしない', async () => {
    const res = await request('/api/health', makeEnv({ ENVIRONMENT: 'production' }))
    expect(res.status).toBe(401)
  })
})

describe('API', () => {
  const env = makeEnv({ ENVIRONMENT: 'local' })

  it('GET /api/health は今日の日付（JST）を返す', async () => {
    const res = await request('/api/health', env)
    const body = (await res.json()) as { ok: boolean; today: string }
    expect(body.today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('存在しない API は共通のエラー形式で 404（画面にはフォールバックしない）', async () => {
    const res = await request('/api/nope', env)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'API が見つかりません' } })
  })
})
