/**
 * AI がウェブで調べたときの出典 URL（docs/design/06-ai.md「ウェブ検索」）。
 * 価格と日持ちは、出典の付いていない答えを捨てる（「答えなし」と同じ扱い）
 */

/** 食材 1 件あたりに残す出典の数 */
export const MAX_SOURCE_URLS = 3
/** 長すぎる URL は捨てる（検索結果の追跡用の長いものなど） */
export const MAX_SOURCE_URL_LENGTH = 500

/** 画像やファイルの URL（根拠のページではない。検索せずに答えたとき画像の URL を出すことがあった） */
const FILE_EXTENSIONS = /\.(jpe?g|png|gif|webp|svg|avif|ico|css|js)$/i

/**
 * http(s) のページの URL だけを、重ねずに MAX_SOURCE_URLS 件まで残す。使えるものがなければ空。
 * サイトのトップページ（道もクエリもない URL）と画像などのファイルは、根拠にならないので捨てる
 */
export function validSourceUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const urls: string[] = []
  for (const v of value) {
    if (typeof v !== 'string') continue
    const text = v.trim()
    if (text.length === 0 || text.length > MAX_SOURCE_URL_LENGTH) continue
    let url: URL
    try {
      url = new URL(text)
    } catch {
      continue
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') continue
    if (url.pathname === '/' && url.search === '') continue
    if (FILE_EXTENSIONS.test(url.pathname)) continue
    if (!urls.includes(url.href)) urls.push(url.href)
    if (urls.length >= MAX_SOURCE_URLS) break
  }
  return urls
}
