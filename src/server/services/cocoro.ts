import { z } from 'zod'
import type { RecipeDraftOfficial } from '../../shared/schemas/recipeDraft'
import { ApiError } from '../errors'
import { decodeEntities, readLimited } from './recipeImport'

/**
 * COCORO KITCHEN（シャープ公式）のレシピ取り込み。
 * レシピのページは画面を JS で組み立てるので HTML に本文がない。レシピ 1 件の JSON API を取り、
 * 本文は AI に渡す文字列に、件数・メニュー番号・写真のキーは下書きの official に入れる。
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
