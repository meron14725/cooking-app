import { Hono } from 'hono'
import { isImageKey } from '../../shared/domain/images'
import type { AppEnv } from '../app'
import { ApiError } from '../errors'

const PREFIX = '/api/images/'

/**
 * レシピ写真を R2（IMAGES）から返す。/api の下なので Access の認証を通ったリクエストだけが届く。
 * 認証の後ろなので共有キャッシュ（CDN）には載せず、ブラウザにだけ 1 日キャッシュさせる
 */
export const imageRoutes = new Hono<AppEnv>().get('/*', async (c) => {
  const path = new URL(c.req.url).pathname
  let key = ''
  try {
    key = decodeURIComponent(path.startsWith(PREFIX) ? path.slice(PREFIX.length) : '')
  } catch {
    // 壊れた % エンコードは下で 400 にする
  }
  if (!isImageKey(key)) throw new ApiError(400, 'INVALID_IMAGE_KEY', '画像のキーが正しくありません')

  const object = await c.env.IMAGES.get(key)
  if (!object) throw new ApiError(404, 'NOT_FOUND', '画像が見つかりません')

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'image/jpeg')
  headers.set('Cache-Control', 'private, max-age=86400')
  headers.set('ETag', object.httpEtag)
  headers.set('X-Content-Type-Options', 'nosniff')
  return new Response(object.body, { headers })
})
