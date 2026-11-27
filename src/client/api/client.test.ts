import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError, apiFetch, isAuthError } from './client'

function mockFetch(res: Partial<Response> & { jsonBody?: unknown }) {
  const fn = vi.fn(async () => ({
    ok: res.status !== undefined && res.status >= 200 && res.status < 300,
    type: 'basic',
    statusText: '',
    json: async () => {
      if (res.jsonBody === undefined) throw new Error('no body')
      return res.jsonBody
    },
    ...res,
  }))
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => vi.unstubAllGlobals())

describe('apiFetch', () => {
  it('成功時は JSON を返す', async () => {
    mockFetch({ status: 200, jsonBody: { ok: true } })
    await expect(apiFetch('/health')).resolves.toEqual({ ok: true })
  })

  it('204 は本文を読まずに undefined を返す', async () => {
    mockFetch({ status: 204 })
    await expect(apiFetch('/x', { method: 'DELETE' })).resolves.toBeUndefined()
  })

  it('エラー形式の本文からコードとメッセージを取り出す', async () => {
    mockFetch({ status: 404, jsonBody: { error: { code: 'NOT_FOUND', message: 'ない' } } })
    await expect(apiFetch('/x')).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND', message: 'ない' })
  })

  it('本文が JSON でも error キーがなければ UNKNOWN', async () => {
    mockFetch({ status: 500, statusText: 'Internal Server Error', jsonBody: { foo: 1 } })
    await expect(apiFetch('/x')).rejects.toMatchObject({ code: 'UNKNOWN' })
  })

  it('401 はログイン切れ', async () => {
    mockFetch({ status: 401, jsonBody: { error: { code: 'UNAUTHENTICATED', message: '' } } })
    const err = await apiFetch('/x').catch((e: unknown) => e)
    expect(isAuthError(err)).toBe(true)
  })

  it('Access のログイン画面へのリダイレクトもログイン切れ', async () => {
    mockFetch({ status: 0, type: 'opaqueredirect' })
    const err = await apiFetch('/x').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiRequestError)
    expect(isAuthError(err)).toBe(true)
  })

  it('Content-Type は body があるときだけ付ける', async () => {
    const fn = mockFetch({ status: 200, jsonBody: {} })
    await apiFetch('/a')
    await apiFetch('/b', { method: 'POST', body: '{}' })
    const headersOf = (i: number) => (fn.mock.calls[i] as unknown as [string, RequestInit])[1].headers as Headers
    expect(headersOf(0).has('Content-Type')).toBe(false)
    expect(headersOf(1).get('Content-Type')).toBe('application/json')
  })
})
