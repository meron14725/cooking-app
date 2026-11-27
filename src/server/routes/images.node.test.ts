import { beforeEach, describe, expect, it } from 'vitest'
import { createTestApi } from '../testing/app'
import type { createTestR2 } from '../testing/r2'

let api: ReturnType<typeof createTestApi>
let bucket: ReturnType<typeof createTestR2>

beforeEach(async () => {
  api = createTestApi()
  bucket = api.env.IMAGES as ReturnType<typeof createTestR2>
  await bucket.put('img/R0001.jpg', new Uint8Array([0xff, 0xd8, 0xff]), { httpMetadata: { contentType: 'image/jpeg' } })
  await bucket.put('img/R0002.jpg', new Uint8Array([1, 2, 3]))
})

describe('GET /api/images/*', () => {
  it('img/ の下のキーなら R2 の本文を返す。キャッシュはブラウザだけ', async () => {
    const res = await api.raw('/images/img/R0001.jpg')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/jpeg')
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=86400')
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([0xff, 0xd8, 0xff])
  })

  it('R2 に Content-Type がなければ image/jpeg', async () => {
    const res = await api.raw('/images/img/R0002.jpg')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/jpeg')
  })

  it('無いキーは 404', async () => {
    const res = await api.raw('/images/img/R9999.jpg')
    expect(res.status).toBe(404)
  })

  it.each([
    ['img/ 以外', '/images/other/R0001.jpg'],
    ['img/ の直下でない', '/images/img/a/R0001.jpg'],
    ['エンコードした ..', '/images/img/%2e%2e/secret'],
    ['エンコードした /', '/images/img%2F..%2Fsecret'],
    ['キーなし', '/images/'],
    ['壊れたエンコード', '/images/img/%E0%A4%A'],
  ])('%s は 400', async (_, path) => {
    const res = await api.raw(path)
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('INVALID_IMAGE_KEY')
  })
})
