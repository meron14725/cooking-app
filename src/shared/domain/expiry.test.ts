import { describe, expect, it } from 'vitest'
import { computeExpiresOn, daysLeftLabel, expiryOf, shelfLifeDays } from './expiry'

const onion = { canFreeze: true, fridgeDays: 60, freezerDays: 30, pantryDays: 30 }
const tofu = { canFreeze: false, fridgeDays: 5, freezerDays: null, pantryDays: null }
const pork = { canFreeze: true, fridgeDays: 2, freezerDays: null, pantryDays: null }

describe('shelfLifeDays', () => {
  it('保存場所ごとの日持ち', () => {
    expect(shelfLifeDays(onion, 'fridge')).toBe(60)
    expect(shelfLifeDays(onion, 'freezer')).toBe(30)
    expect(shelfLifeDays(onion, 'pantry')).toBe(30)
  })
  it('未設定のときの扱い', () => {
    expect(shelfLifeDays(pork, 'freezer')).toBe(30)
    expect(shelfLifeDays(tofu, 'freezer')).toBe(5)
    expect(shelfLifeDays(tofu, 'pantry')).toBe(5)
  })
})

describe('computeExpiresOn', () => {
  it('購入日 + 日持ち（月またぎ）', () => {
    expect(computeExpiresOn('2026-11-29', 'fridge', pork)).toBe('2026-12-01')
  })
})

describe('expiryOf', () => {
  it('期限間近は 2 日以内、過ぎたものも含む', () => {
    expect(expiryOf('2026-11-30', '2026-11-27')).toEqual({ daysLeft: 3, isExpiringSoon: false, status: 'ok' })
    expect(expiryOf('2026-11-29', '2026-11-27')).toEqual({ daysLeft: 2, isExpiringSoon: true, status: 'soon' })
    expect(expiryOf('2026-11-27', '2026-11-27').status).toBe('soon')
    expect(expiryOf('2026-11-26', '2026-11-27')).toEqual({ daysLeft: -1, isExpiringSoon: true, status: 'expired' })
  })
  it('文言', () => {
    expect([-2, 0, 1, 5].map(daysLeftLabel)).toEqual(['2日過ぎ', '今日まで', '明日まで', 'あと5日'])
  })
})
