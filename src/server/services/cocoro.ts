import { z } from 'zod'
import type { RecipeDraftOfficial, RecipeDraftRaw } from '../../shared/schemas/recipeDraft'
import { ApiError } from '../errors'
import { decodeEntities, readLimited } from './recipeImport'

/**
 * COCORO KITCHEN（シャープ公式）のレシピ取り込み。
 * レシピのページは画面を JS で組み立てるので HTML に本文がない。レシピ 1 件の JSON API を取り、
 * その JSON から AI を使わずに下書きを組み立てる（cocoroDraftRaw）。件数・メニュー番号・写真のキーは下書きの official に入れる。
 * 利用者のメモが付いたときだけ、本文を AI に渡す文字列（cocoroSourceText）にしてメモと一緒に AI に読ませる。
 * 本文や写真はリポジトリにもデータベースの初期データにも入れない（取り込んだ利用者の D1 にだけ入る）
 */

const HOST = 'cocoroplus.jp.sharp'
const DEFAULT_MODEL = 'KN-HW16G'
const FETCH_TIMEOUT_MS = 10_000

export type CocoroRef = { model: string; code: string }

/** https://cocoroplus.jp.sharp/kitchen/recipe/hotcook/{機種}/{レシピコード}。機種がなければ KN-HW16G */
export function parseCocoroUrl(url: URL): CocoroRef | null {
  if (url.hostname.toLowerCase() !== HOST) return null
  const m = url.pathname.match(/^\/kitchen\/recipe\/hotcook\/(?:([A-Za-z0-9-]{1,20})\/)?([A-Za-z]{1,3}\d{1,8})\/?$/)
  if (!m?.[2]) return null
  return { model: m[1] ?? DEFAULT_MODEL, code: m[2] }
}

export function cocoroApiUrl({ model, code }: CocoroRef): string {
  return `https://${HOST}/kitchen/recipe/api/recipe/${encodeURIComponent(code)}/${encodeURIComponent(model)}`
}

const count = z.number().int().min(0).nullish().catch(null)
const str = z.string().nullish().catch(null)

/** 使う欄だけを読む（ほかの欄は無視する） */
export const cocoroRecipeSchema = z.object({
  name: z.string().min(1),
  quantity: str,
  cookingTime: str,
  calorie: str,
  menuNum: z.union([z.string(), z.number()]).nullish().catch(null),
  /** まぜ技ユニットを使うか */
  isMixed: z.boolean().nullish().catch(null),
  imageUrl: str,
  favoriteCount: count,
  cookCount: count,
  score: count,
  materials: z
    .array(z.object({ name: z.string(), quantity: str, group: str }))
    .nullish()
    .catch(null),
  material_appendices: z.array(z.string()).nullish().catch(null),
  methods: z
    .array(z.object({ text: str, renderedHtml: str }))
    .nullish()
    .catch(null),
})
export type CocoroRecipe = z.infer<typeof cocoroRecipeSchema>

export async function fetchCocoroRecipe(ref: CocoroRef, fetchImpl: typeof fetch = fetch): Promise<CocoroRecipe> {
  let res: Response
  try {
    res = await fetchImpl(cocoroApiUrl(ref), {
      headers: { Accept: 'application/json', 'User-Agent': 'cooking-app (recipe import)' },
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch {
    throw new ApiError(502, 'FETCH_FAILED', 'レシピを取得できませんでした（タイムアウトなど）')
  }
  if (!res.ok) throw new ApiError(502, 'FETCH_FAILED', `レシピを取得できませんでした（${res.status}）`)
  let json: unknown
  try {
    json = JSON.parse(new TextDecoder().decode(await readLimited(res)))
  } catch (e) {
    if (e instanceof ApiError) throw e
    throw new ApiError(502, 'FETCH_FAILED', 'レシピの形式が読めませんでした')
  }
  const parsed = cocoroRecipeSchema.safeParse(json)
  if (!parsed.success) throw new ApiError(502, 'FETCH_FAILED', 'レシピの形式が読めませんでした')
  return parsed.data
}

/** menuNum は "63" や "0063" で来る。3 桁にそろえる（063）。数字でなければ null */
export function toOfficialMenuNo(menuNum: string | number | null | undefined): string | null {
  const digits = String(menuNum ?? '').trim()
  if (!/^\d{1,4}$/.test(digits)) return null
  const n = Number(digits)
  return n > 0 && n < 1000 ? String(n).padStart(3, '0') : null
}

export function cocoroOfficial(recipe: CocoroRecipe, ref: CocoroRef): RecipeDraftOfficial {
  return {
    officialMenuNo: toOfficialMenuNo(recipe.menuNum),
    // 写真は利用者が R2 に img/{レシピコード}.jpg で上げる（docs/deploy.md）。ここではキーだけ決める
    imageKey: recipe.imageUrl ? `img/${ref.code}.jpg` : null,
    favoriteCount: recipe.favoriteCount ?? null,
    cookCount: recipe.cookCount ?? null,
    score: recipe.score ?? null,
  }
}

const plain = (s: string | null | undefined) =>
  decodeEntities((s ?? '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()

/** AI に渡す本文（URL 取り込みの buildSourceText と同じ形） */
export function cocoroSourceText(recipe: CocoroRecipe): string {
  const lines = [
    `タイトル: ${plain(recipe.name)}`,
    recipe.quantity ? `分量: ${plain(recipe.quantity)}` : null,
    recipe.cookingTime ? `調理時間: ${plain(recipe.cookingTime)}` : null,
    recipe.calorie ? `カロリー: ${plain(recipe.calorie)}` : null,
    '材料:',
    ...(recipe.materials ?? []).map((m) =>
      `- ${m.group ? `${plain(m.group)} ` : ''}${plain(m.name)} ${plain(m.quantity)}`.trimEnd(),
    ),
    ...(recipe.material_appendices ?? []).map((a) => `※ ${plain(a)}`),
    '作り方:',
    ...(recipe.methods ?? [])
      .map((m) => plain(m.text || m.renderedHtml))
      .filter(Boolean)
      .map((t, n) => `${n + 1}. ${t}`),
  ]
  return lines.filter((l) => l !== null).join('\n')
}

/** 少々・適量など、量を数えない表記 */
const UNCOUNTED = /^(少々|適量|適宜|お好みで|ひとつまみ|少量)/

const toNumber = (t: string): number | null => {
  // 1と1/2、1/2、1.5、2
  const m = t.match(/^(?:(\d+(?:\.\d+)?)と)?(\d+(?:\.\d+)?)(?:\/(\d+(?:\.\d+)?))?$/)
  if (!m) return null
  const whole = m[1] ? Number(m[1]) : 0
  const value = m[3] ? Number(m[2]) / Number(m[3]) : Number(m[2])
  return Number.isFinite(value) && Number(m[3] ?? 1) > 0 ? whole + value : null
}

/**
 * 材料の量の表記を数と単位にする。例: 「300 g」→ 300 g、「1/2個」→ 0.5 個、「大さじ1と1/2」→ 1.5 大さじ。
 * 少々・適量や読めない表記は quantity: null（単位も null）
 */
export function parseAmountText(text: string | null | undefined): { quantity: number | null; unit: string | null } {
  const t = (text ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(/[(（].*?[)）]/g, '')
  if (!t || UNCOUNTED.test(t)) return { quantity: null, unit: null }
  // 単位が前: 大さじ1、小さじ1/2、カップ1
  const before = t.match(/^(大さじ|小さじ|カップ)([\d./と]+)/)
  if (before?.[1] && before[2]) {
    const q = toNumber(before[2])
    return q === null ? { quantity: null, unit: null } : { quantity: q, unit: before[1] }
  }
  // 単位が後: 300g、1/2個、2切れ、1片。「2〜3個」のような範囲は少ないほうの量と、後ろの単位
  const after = t.match(/^([\d./と]+)(?:[~〜～][\d./と]+)?([^\d~〜～]*)/)
  if (after?.[1]) {
    const q = toNumber(after[1])
    const unit = (after[2] ?? '').replace(/[程くらい分]+$/, '') || null
    return q === null ? { quantity: null, unit: null } : { quantity: q, unit }
  }
  return { quantity: null, unit: null }
}

/** 切り方らしい括弧書き。例: 玉ねぎ（くし形切り） */
const CUT = /(切り|切る|みじん|すりおろ|ちぎ|ほぐ|そぎ|角|等分)/

/** 「2人分」「2〜4人分」→ 2。読めなければ null */
export function parseServings(text: string | null | undefined): number | null {
  const m = (text ?? '').normalize('NFKC').match(/(\d+(?:\.\d+)?)/)
  const n = m?.[1] ? Number(m[1]) : null
  return n !== null && n > 0 && n <= 20 ? n : null
}

/** 「310kcal」「1人分 約310kcal」→ 310。「全量」とあれば人数で割る。読めなければ null */
export function parseCalorie(text: string | null | undefined, servings: number): number | null {
  const t = (text ?? '').normalize('NFKC')
  const m = t.match(/(\d+(?:\.\d+)?)\s*kcal/i)
  if (!m?.[1]) return null
  const kcal = Number(m[1]) / (/全量|総/.test(t) ? servings : 1)
  return kcal >= 0 && kcal <= 5000 ? Math.round(kcal) : null
}

/** ホットクックの設定。メニュー番号があれば「メニュー番号で探す → No.063」 */
export function cocoroHotcookMode(recipe: CocoroRecipe): string | null {
  const no = toOfficialMenuNo(recipe.menuNum)
  return no ? `メニュー番号で探す → No.${no}` : null
}

/**
 * レシピ 1 件の JSON から、AI を使わずに下書きを組み立てる（このあと normalizeDraft で食材マスタと照合する）。
 * 手順は「内鍋」が出てくる手順から後を調理、それより前を下ごしらえにする
 */
export function cocoroDraftRaw(recipe: CocoroRecipe): RecipeDraftRaw {
  const warnings: string[] = []
  const parsedServings = parseServings(recipe.quantity)
  if (parsedServings === null) warnings.push('何人分か読めなかったので 2 人分にしています。確認してください')
  const servings = parsedServings ?? 2
  const ingredients = (recipe.materials ?? []).map((m) => {
    const rawName = plain(m.name)
    const paren = rawName.match(/[（(](.*?)[）)]/)?.[1] ?? null
    const name = rawName.replace(/[（(].*?[）)]/g, '').trim() || rawName
    const amount = parseAmountText(plain(m.quantity))
    const group = plain(m.group)
    return {
      displayText: `${rawName} ${plain(m.quantity)}${group ? `（${group}）` : ''}`.trim(),
      name,
      quantity: amount.quantity,
      unit: amount.unit,
      cutStyle: paren && CUT.test(paren) ? paren : null,
    }
  })
  const methods = (recipe.methods ?? []).map((m) => plain(m.text || m.renderedHtml)).filter(Boolean)
  const firstCook = methods.findIndex((t) => t.includes('内鍋'))
  const steps: RecipeDraftRaw['steps'] = methods.map((text, n) => ({
    phase: firstCook >= 0 && n < firstCook ? 'prep' : 'cook',
    text,
  }))
  if (recipe.isMixed === true || recipe.isMixed === false) {
    steps.push({ phase: 'cook', text: recipe.isMixed ? 'まぜ技ユニットを付ける' : 'まぜ技ユニットは付けない' })
  }
  for (const a of recipe.material_appendices ?? []) {
    const t = plain(a)
    if (t) warnings.push(`※ ${t}`)
  }
  return {
    title: plain(recipe.name),
    servings,
    caloriesKcal: parseCalorie(recipe.calorie, servings),
    hotcookMode: cocoroHotcookMode(recipe),
    maxServings1_6l: null,
    ingredients,
    steps,
    warnings,
  }
}
