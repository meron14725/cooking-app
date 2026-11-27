import type { MiddlewareHandler } from 'hono'
import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from 'jose'
import type { AppEnv } from './app'

/**
 * Cloudflare Access の JWT を検証する（docs/design/01-architecture.md の「Worker 側での JWT 検証」）。
 * ヘッダの有無ではなく、署名・aud・iss・有効期限を確認する。
 */
export async function verifyAccessJwt(
  token: string,
  opts: { teamDomain: string; aud: string; getKey: JWTVerifyGetKey },
): Promise<{ email: string | null }> {
  const { payload } = await jwtVerify(token, opts.getKey, {
    issuer: `https://${opts.teamDomain}`,
    audience: opts.aud,
  })
  return { email: typeof payload.email === 'string' ? payload.email : null }
}

const jwksCache = new Map<string, JWTVerifyGetKey>()

function remoteJwks(teamDomain: string): JWTVerifyGetKey {
  let jwks = jwksCache.get(teamDomain)
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`))
    jwksCache.set(teamDomain, jwks)
  }
  return jwks
}

export const ACCESS_JWT_HEADER = 'Cf-Access-Jwt-Assertion'

function reject(c: Parameters<MiddlewareHandler<AppEnv>>[0], status: 401 | 503, code: string, message: string) {
  if (c.req.path.startsWith('/api/')) {
    return c.json({ error: { code, message } }, status)
  }
  return c.text(message, status)
}

export function accessAuth(getKey: (teamDomain: string) => JWTVerifyGetKey = remoteJwks): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    // ローカル開発だけは明示的な変数でスキップする（ホスト名では判定しない）
    if (c.env.ENVIRONMENT === 'local') return next()

    const { ACCESS_TEAM_DOMAIN: teamDomain, ACCESS_AUD: aud } = c.env
    if (!teamDomain || !aud) {
      // 設定漏れのときは開けずに閉じる
      return reject(c, 503, 'AUTH_NOT_CONFIGURED', '認証の設定がされていません')
    }

    const token = c.req.header(ACCESS_JWT_HEADER)
    if (!token) return reject(c, 401, 'UNAUTHENTICATED', 'ログインが必要です')

    try {
      const { email } = await verifyAccessJwt(token, { teamDomain, aud, getKey: getKey(teamDomain) })
      c.set('userEmail', email)
    } catch {
      return reject(c, 401, 'UNAUTHENTICATED', 'ログインが必要です')
    }
    return next()
  }
}
