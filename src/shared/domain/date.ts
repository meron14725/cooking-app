const JST_OFFSET_MS = 9 * 60 * 60 * 1000

/**
 * Asia/Tokyo の今日の日付を YYYY-MM-DD で返す。
 * Workers は UTC で動くので「今日」はこの関数だけで作り、ロジック側には引数で渡す。
 */
export function todayJst(now: Date = new Date()): string {
  return new Date(now.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10)
}

/** YYYY-MM-DD に日数を足す（負の値で引く）。 */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** to − from の日数（YYYY-MM-DD 同士）。 */
export function diffDays(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)
  return Math.round(ms / 86_400_000)
}

/** 2026-11-08 → 11/8（画面の短い日付） */
export function shortDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${m}/${d}`
}
