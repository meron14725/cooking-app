/**
 * ホットクックの設定の文字列（例: 手動 > 煮物を作る > まぜる > 10分）を、
 * 大きく出す加熱時間（分）と、そのほかの手順に分ける。時間が読めなければ minutes は null
 */
export function splitHotcookMode(mode: string | null): { minutes: number | null; label: string } {
  if (!mode) return { minutes: null, label: '' }
  const parts = mode
    .split(/\s*[>＞]\s*/)
    .map((p) => p.trim())
    .filter(Boolean)
  let minutes: number | null = null
  const rest: string[] = []
  for (const p of parts) {
    const m = p.normalize('NFKC').match(/^(?:約)?(\d{1,3})\s*分$/)
    if (m && minutes === null) minutes = Number(m[1])
    else if (p !== '手動') rest.push(p)
  }
  return { minutes, label: rest.join(' ・ ') }
}
