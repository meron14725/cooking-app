import { describe, expect, it } from 'vitest'
import { addDays, diffDays, todayJst } from './date'

describe('todayJst', () => {
  it('UTC 14:59 は JST では同じ日の 23:59', () => {
    expect(todayJst(new Date('2026-11-27T14:59:00Z'))).toBe('2026-11-27')
  })

  it('UTC 15:00 は JST では翌日の 0:00', () => {
    expect(todayJst(new Date('2026-11-27T15:00:00Z'))).toBe('2026-11-28')
  })
})

describe('addDays', () => {
  it('月末をまたぐ', () => {
    expect(addDays('2026-11-29', 3)).toBe('2026-12-02')
  })

  it('負の値で引く', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('diffDays', () => {
  it('日数の差を返す', () => {
    expect(diffDays('2026-11-27', '2026-11-30')).toBe(3)
    expect(diffDays('2026-11-30', '2026-11-27')).toBe(-3)
  })
})
