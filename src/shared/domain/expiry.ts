/**
 * 在庫の期限（docs/design/02-data-model.md「期限間近」）。
 * 今日は引数で受け取り、自分では時計を読まない。
 */
import type { StorageLocation } from '../schemas/ingredient'
import { DEFAULT_FREEZER_DAYS, EXPIRING_SOON_DAYS } from './constants'
import { addDays, diffDays } from './date'

export type ShelfLife = {
  canFreeze: boolean
  fridgeDays: number
  freezerDays: number | null
  pantryDays: number | null
}

/**
 * 保存場所ごとの丸ごとの日持ち（日）。
 * - 冷凍: freezer_days。冷凍できる食材で未設定なら目安の 30 日。冷凍できない食材は冷蔵と同じ扱い
 * - 常温: pantry_days。未設定（常温に向かない食材）なら冷蔵と同じ日数にしておく
 */
export function shelfLifeDays(master: ShelfLife, location: StorageLocation): number {
  if (location === 'freezer') {
    if (!master.canFreeze) return master.fridgeDays
    return master.freezerDays ?? DEFAULT_FREEZER_DAYS
  }
  if (location === 'pantry') return master.pantryDays ?? master.fridgeDays
  return master.fridgeDays
}

/** 期限 = 購入日 + 保存場所の日持ち */
export function computeExpiresOn(purchasedOn: string, location: StorageLocation, master: ShelfLife): string {
  return addDays(purchasedOn, shelfLifeDays(master, location))
}

export type ExpiryStatus = 'expired' | 'soon' | 'ok'

export type Expiry = {
  /** 期限 − 今日。0 = 今日まで、負 = 過ぎている */
  daysLeft: number
  /** 期限が近い（過ぎているものを含む） */
  isExpiringSoon: boolean
  status: ExpiryStatus
}

export function expiryOf(expiresOn: string, today: string): Expiry {
  const daysLeft = diffDays(today, expiresOn)
  const status: ExpiryStatus = daysLeft < 0 ? 'expired' : daysLeft <= EXPIRING_SOON_DAYS ? 'soon' : 'ok'
  return { daysLeft, isExpiringSoon: status !== 'ok', status }
}

/** 画面向けの残り日数の文言 */
export function daysLeftLabel(daysLeft: number): string {
  if (daysLeft < 0) return `${-daysLeft}日過ぎ`
  if (daysLeft === 0) return '今日まで'
  if (daysLeft === 1) return '明日まで'
  return `あと${daysLeft}日`
}
