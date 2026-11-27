import { normalizeUnit, toBaseQuantity } from '../../shared/domain/units'
import type { Ingredient } from '../../shared/schemas/ingredient'
import type { RecipeDraft, RecipeDraftRaw } from '../../shared/schemas/recipeDraft'
import { ApiError } from '../errors'

const FETCH_TIMEOUT_MS = 10_000
const MAX_PAGE_BYTES = 2 * 1024 * 1024
const MAX_TEXT_CHARS = 20_000

// ---------- URL の確認 ----------

/** 取りに行ってよい URL か（http(s) で、ローカルや社内向けのホストではない） */
export function assertPublicUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new ApiError(400, 'INVALID_URL', 'URL の形式が正しくありません')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ApiError(400, 'INVALID_URL', 'http または https の URL を入れてください')
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  const privateHost =
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    /^(127|10|0)\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === '::1' ||
    /^f[cd][0-9a-f]{2}:/.test(host) ||
    /^fe80:/.test(host)
  if (privateHost) throw new ApiError(400, 'INVALID_URL', 'この URL は取り込めません')
  return url
}

// ---------- ページの取得 ----------

export async function readLimited(res: Response): Promise<Uint8Array> {
  const reader = res.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_PAGE_BYTES) {
      await reader.cancel()
      throw new ApiError(400, 'PAGE_TOO_LARGE', 'ページが大きすぎて取り込めません')
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out
}

/** Content-Type か <meta charset> から文字コードを決めて読む（日本語サイトの Shift_JIS / EUC-JP 用） */
export function decodeHtml(bytes: Uint8Array, contentType: string | null): string {
  const fromHeader = contentType?.match(/charset=["']?([\w-]+)/i)?.[1]
  const head = new TextDecoder('utf-8').decode(bytes.subarray(0, 4096))
  const fromMeta = head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1]
  const label = (fromHeader ?? fromMeta ?? 'utf-8').toLowerCase()
  try {
    return new TextDecoder(label).decode(bytes)
  } catch {
    return new TextDecoder('utf-8').decode(bytes)
  }
}

const MAX_REDIRECTS = 3

/**
 * ページを取る。リダイレクトは自分でたどり、行き先ごとに assertPublicUrl で確かめる（3 回まで）。
 * タイムアウトはリダイレクトを含めて全体で 10 秒。
 */
export async function fetchPage(url: URL, fetchImpl: typeof fetch = fetch): Promise<string> {
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS)
  let current = url
  let res: Response | undefined
  for (let hop = 0; ; hop++) {
    try {
      res = await fetchImpl(current.toString(), {
        headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'cooking-app (recipe import)' },
        redirect: 'manual',
        signal,
      })
    } catch {
      throw new ApiError(502, 'FETCH_FAILED', 'ページを取得できませんでした（タイムアウトなど）')
    }
    const location = res.status >= 300 && res.status < 400 ? res.headers.get('Location') : null
    if (!location) break
    if (hop >= MAX_REDIRECTS) throw new ApiError(502, 'FETCH_FAILED', 'リダイレクトが多すぎて取得できませんでした')
    current = assertPublicUrl(new URL(location, current).toString())
  }
  if (!res.ok) throw new ApiError(502, 'FETCH_FAILED', `ページを取得できませんでした（${res.status}）`)
  const type = res.headers.get('Content-Type')
  if (type && !/html|xml/i.test(type)) throw new ApiError(400, 'NOT_HTML', 'レシピのページ（HTML）ではありません')
  return decodeHtml(await readLimited(res), type)
}

// ---------- 本文の取り出し ----------

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1))
      return Number.isFinite(code) ? String.fromCodePoint(code) : m
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })
}

/** HTML からタグを除いた本文（上限 2 万文字） */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|\/p|\/li|\/h\d|\/div|\/tr|\/dt|\/dd|\/section|\/article)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
  return decodeEntities(text)
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, MAX_TEXT_CHARS)
}

export function pageTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return m?.[1] ? decodeEntities(m[1]).replace(/\s+/g, ' ').trim() || null : null
}

export type JsonLdRecipe = {
  name: string | null
  recipeYield: string | null
  ingredients: string[]
  instructions: string[]
}

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v])
const isType = (node: Record<string, unknown>, type: string) => asArray(node['@type']).includes(type)
const clean = (s: unknown) =>
  typeof s === 'string'
    ? decodeEntities(s)
        .replace(/<[^>]+>/g, ' ')
        .trim()
    : ''

function instructionTexts(v: unknown): string[] {
  return asArray(v).flatMap((step): string[] => {
    if (typeof step === 'string') return clean(step) ? [clean(step)] : []
    if (step && typeof step === 'object') {
      const node = step as Record<string, unknown>
      if (isType(node, 'HowToSection')) return instructionTexts(node.itemListElement)
      const text = clean(node.text) || clean(node.name)
      return text ? [text] : []
    }
    return []
  })
}

/** <script type="application/ld+json"> の schema.org Recipe を読む。なければ null */
export function extractJsonLdRecipe(html: string): JsonLdRecipe | null {
  const scripts = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  for (const [, body] of scripts) {
    let data: unknown
    try {
      data = JSON.parse(body ?? '')
    } catch {
      continue
    }
    const queue = [...asArray(data)]
    while (queue.length > 0) {
      const node = queue.shift()
      if (!node || typeof node !== 'object') continue
      const obj = node as Record<string, unknown>
      if (obj['@graph']) queue.push(...asArray(obj['@graph']))
      if (!isType(obj, 'Recipe')) continue
      const ingredients = asArray(obj.recipeIngredient ?? obj.ingredients)
        .map(clean)
        .filter(Boolean)
      if (ingredients.length === 0) continue
      const yieldValue = asArray(obj.recipeYield).map((y) => clean(String(y)))[0] || null
      return {
        name: clean(obj.name) || null,
        recipeYield: yieldValue,
        ingredients,
        instructions: instructionTexts(obj.recipeInstructions),
      }
    }
  }
  return null
}

/** AI に渡す本文。構造化データがあればそれを、なければタグを除いた本文を使う */
export function buildSourceText(html: string): { text: string; structured: boolean } {
  const recipe = extractJsonLdRecipe(html)
  if (recipe) {
    const lines = [
      `タイトル: ${recipe.name ?? pageTitle(html) ?? ''}`,
      recipe.recipeYield ? `分量: ${recipe.recipeYield}` : null,
      '材料:',
      ...recipe.ingredients.map((i) => `- ${i}`),
      '作り方:',
      ...recipe.instructions.map((s, n) => `${n + 1}. ${s}`),
    ]
    return { text: lines.filter((l) => l !== null).join('\n'), structured: true }
  }
  const title = pageTitle(html)
  return { text: `${title ? `タイトル: ${title}\n` : ''}${htmlToText(html)}`, structured: false }
}

// ---------- 下書きの正規化 ----------

const key = (s: string) => s.normalize('NFKC').replace(/\s+/g, '').toLowerCase()

/** 名前か別名で食材マスタを引く表（括弧書きを外した名前でも引けるようにする） */
export function buildMasterIndex(masters: Ingredient[]): Map<string, Ingredient> {
  const index = new Map<string, Ingredient>()
  const add = (name: string, m: Ingredient) => {
    const k = key(name)
    if (k && !index.has(k)) index.set(k, m)
  }
  for (const m of masters) add(m.name, m)
  for (const m of masters) for (const a of m.aliases) add(a, m)
  for (const m of masters) add(m.name.replace(/[（(].*?[）)]/g, ''), m)
  return index
}

/**
 * AI の生の出力を RecipeDraft にする。別名で照合し直して ingredientId を埋め、単位を基準単位に直す。
 * 直せない量は null にして warnings に理由を足す（docs/design/04-api.md「単位の扱い」）。
 */
export function normalizeDraft(raw: RecipeDraftRaw, masters: Ingredient[], sourceUrl: string | null): RecipeDraft {
  const index = buildMasterIndex(masters)
  const warnings = [...raw.warnings]
  const ingredients = raw.ingredients.map((i) => {
    const master = index.get(key(i.name)) ?? index.get(key(i.name.replace(/[（(].*?[）)]/g, '')))
    if (!master) {
      return {
        displayText: i.displayText,
        ingredientId: null,
        suggestedName: i.name,
        suggestedUnit: i.unit,
        quantity: i.quantity,
        cutStyle: i.cutStyle,
      }
    }
    let quantity = i.quantity
    if (quantity !== null && i.unit && normalizeUnit(i.unit) !== normalizeUnit(master.unit)) {
      const converted = toBaseQuantity({ quantity, unit: i.unit }, master)
      quantity = converted.quantity
      if (converted.warning) warnings.push(converted.warning)
    }
    return {
      displayText: i.displayText,
      ingredientId: master.id,
      suggestedName: master.name,
      suggestedUnit: null,
      quantity,
      cutStyle: i.cutStyle,
    }
  })
  const unmatched = ingredients.filter((i) => !i.ingredientId).map((i) => i.suggestedName)
  if (unmatched.length > 0) {
    warnings.push(`食材マスタにない食材があります: ${unmatched.join('、')}（保存の前にマスタに追加してください）`)
  }
  return {
    title: raw.title,
    servings: raw.servings,
    caloriesKcal: raw.caloriesKcal,
    hotcookMode: raw.hotcookMode,
    sourceUrl,
    sourceType: sourceUrl ? 'url' : 'ai',
    ingredients,
    steps: raw.steps,
    maxServings1_6l: raw.maxServings1_6l,
    warnings,
    official: null,
  }
}
