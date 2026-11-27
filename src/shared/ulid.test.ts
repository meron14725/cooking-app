import { describe, expect, it } from 'vitest'
import { ulid } from './ulid'

describe('ulid', () => {
  it('26 文字の Crockford Base32', () => {
    expect(ulid()).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  })

  it('時刻順に並ぶ', () => {
    const a = ulid(1_700_000_000_000)
    const b = ulid(1_700_000_000_001)
    expect(a < b).toBe(true)
  })

  it('時刻部分は仕様のサンプルと一致する', () => {
    // https://github.com/ulid/spec の例: 1469918176385 → 01ARYZ6S41
    expect(ulid(1469918176385).slice(0, 10)).toBe('01ARYZ6S41')
  })
})
