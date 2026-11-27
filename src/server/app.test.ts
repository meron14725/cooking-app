import { describe, expect, it } from 'vitest'
import { app } from './app'

const env = {} as Env

describe('API', () => {
  it('GET /api/health は ok を返す', async () => {
    const res = await app.request('/api/health', {}, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; today: string }
    expect(body.ok).toBe(true)
    expect(body.today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('存在しない API は共通のエラー形式で 404', async () => {
    const res = await app.request('/api/nope', {}, env)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'API が見つかりません' } })
  })
})
