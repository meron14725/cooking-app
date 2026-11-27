/**
 * レシピの区分・味の系統・まぜ技・調理時間を、名前・材料・ホットクックの設定から AI を使わずに決める
 * （docs/design/09-recommendation-v2.md「区分・系統の推定」）。決められないものは null を返し、
 * あとで「まとめて推定」の AI に回す。
 */
import type { Cuisine, DishType } from '../schemas/recipe'
import { splitHotcookMode } from './hotcook'

export type AttributeIngredient = {
  name: string
  /** 食材マスタの分類（vegetable / meat / fish / tofu_egg_dairy / seasoning / dry / other） */
  category: string
  /** recipes.servings 人前の量（基準単位）。null = 少々 */
  quantity: number | null
  unit: string
  gramsPerUnit: number | null
  isStaple: boolean
}

export type AttributeInput = {
  title: string
  servings: number
  hotcookMode: string | null
  ingredients: AttributeIngredient[]
}

export type RecipeAttributes = {
  dishType: DishType | null
  cuisine: Cuisine | null
  usesMixingUnit: boolean | null
  cookMinutes: number | null
}

/** 主菜とみなす 1 人前の肉・魚・大豆製品・卵の量（g） */
export const MAIN_PROTEIN_GRAMS_PER_SERVING = 60
/** ホットクックの加熱時間に足す下ごしらえの目安（分） */
export const PREP_MINUTES_ESTIMATE = 10
/** 味の系統は、1 位が 2 位よりこの点数以上多いときだけ決める */
const CUISINE_MARGIN = 2

const norm = (s: string) => s.normalize('NFKC')

/** 量を g に直す。g・ml はそのまま、ほかは 1 つあたりの重さを掛ける。直せなければ null */
export function toGrams(quantity: number | null, unit: string, gramsPerUnit: number | null): number | null {
  if (quantity === null) return null
  if (unit === 'g' || unit === 'ml') return quantity
  return gramsPerUnit === null ? null : quantity * gramsPerUnit
}

/** 「約30分」「1時間10分」「30〜40分」などから分を読む。幅があれば大きいほう。読めなければ null */
export function parseCookMinutes(text: string | null | undefined): number | null {
  return inCookRange(readMinutes(text))
}

/** 調理時間として保存できる範囲（1〜600 分）。外なら null */
export const COOK_MINUTES_RANGE = { min: 1, max: 600 } as const
function inCookRange(minutes: number | null): number | null {
  if (minutes === null) return null
  return minutes >= COOK_MINUTES_RANGE.min && minutes <= COOK_MINUTES_RANGE.max ? minutes : null
}

function readMinutes(text: string | null | undefined): number | null {
  if (!text) return null
  const t = norm(text)
  const hm = t.match(/(\d+(?:\.\d+)?)\s*時間(?:\s*(\d+)\s*分)?/)
  if (hm) return Math.round(Number(hm[1]) * 60 + Number(hm[2] ?? 0))
  const range = t.match(/(\d+)\s*[~〜～-]\s*(\d+)\s*分/)
  if (range) return Math.max(Number(range[1]), Number(range[2]))
  const m = t.match(/(\d+)\s*分/)
  return m ? Number(m[1]) : null
}

/** ホットクックの設定の「まぜる / まぜない」。どちらもなければ null */
export function mixingFromHotcookMode(mode: string | null): boolean | null {
  if (!mode) return null
  const t = norm(mode)
  if (/まぜない|混ぜない/.test(t)) return false
  if (/まぜる|混ぜる|まぜ技/.test(t)) return true
  return null
}

export const HEAT_MODES = ['nimono', 'mushi', 'muisui', 'itame', 'soup', 'other'] as const
export type HeatMode = (typeof HEAT_MODES)[number]

/** 加熱のモード（煮物・蒸し物・無水・炒め・スープ・その他）。設定がなければ null */
export function heatModeFromHotcookMode(mode: string | null): HeatMode | null {
  if (!mode) return null
  const t = norm(mode)
  if (/無水/.test(t)) return 'muisui'
  if (/蒸し|蒸す/.test(t)) return 'mushi'
  if (/炒め/.test(t)) return 'itame'
  if (/スープ|汁/.test(t)) return 'soup'
  if (/煮/.test(t)) return 'nimono'
  return 'other'
}

/** 調理時間の目安: ホットクックの加熱時間 + 下ごしらえ。加熱時間が読めなければ null */
export function cookMinutesFromHotcookMode(mode: string | null): number | null {
  const { minutes } = splitHotcookMode(mode)
  return minutes === null ? null : inCookRange(minutes + PREP_MINUTES_ESTIMATE)
}

const SWEETS =
  /ケーキ|プリン|ジャム|蒸しパン|コンポート|ようかん|羊羹|クッキー|ゼリー|甘酒|ぜんざい|しるこ|おやつ|スイーツ|甘露煮|マフィン|ブラウニー/
const SOUP = /汁|スープ|ポタージュ|ミネストローネ|チャウダー|ボルシチ|ガンボ|吸い物|豚汁|けんちん/
const RICE_NOODLE =
  /カレー|ハヤシ|丼|ごはん|ご飯|炊き込み|炊込み|ピラフ|リゾット|パエリア|パスタ|スパゲ|うどん|そば|蕎麦|ラーメン|焼きそば|粥|おかゆ|雑炊|おこわ|ビリヤニ|ジャンバラヤ|チャーハン/
const PROTEIN_CATEGORIES = new Set(['meat', 'fish', 'tofu_egg_dairy'])
/** 乳製品は主菜の判定に数えない（牛乳・チーズで主菜にならないように） */
const NOT_PROTEIN = /牛乳|ミルク|チーズ|バター|生クリーム|ヨーグルト|豆乳/

/**
 * 区分: 名前のキーワード（おやつ → その他、汁物 → 汁物、ご飯もの・麺 → 主菜）→ 1 人前の肉・魚・大豆製品・卵の量。
 * 量が読めなければ null
 */
export function inferDishType(input: AttributeInput): DishType | null {
  const title = norm(input.title)
  if (SWEETS.test(title)) return 'other'
  if (SOUP.test(title)) return 'soup'
  // ご飯もの・麺（カレー・丼など）は、1 品で主菜を兼ねるので主菜にする（#59 のレビュー）
  if (RICE_NOODLE.test(title)) return 'main'

  let proteinGrams = 0
  let anyGrams = false
  for (const i of input.ingredients) {
    if (i.isStaple) continue
    const g = toGrams(i.quantity, i.unit, i.gramsPerUnit)
    if (g === null) continue
    anyGrams = true
    if (PROTEIN_CATEGORIES.has(i.category) && !NOT_PROTEIN.test(norm(i.name))) proteinGrams += g
  }
  if (!anyGrams) return null
  return proteinGrams / input.servings >= MAIN_PROTEIN_GRAMS_PER_SERVING ? 'main' : 'side'
}

type CuisineRule = { cuisine: Cuisine; title: RegExp; ingredient: RegExp }

/** 名前に当たれば 3 点、材料 1 つにつき 1 点 */
const CUISINE_RULES: CuisineRule[] = [
  {
    cuisine: 'japanese',
    title:
      /煮物|煮付け|筑前煮|肉じゃが|おでん|照り焼き|みそ煮|味噌煮|甘辛|和風|すき焼き|きんぴら|白和え|おひたし|角煮|炊き合わせ|ぶり大根|茶碗蒸し|みそ汁|味噌汁|豚汁|けんちん/,
    ingredient: /しょうゆ|醤油|みりん|(?<!中華)だし|かつお|昆布|味噌|みそ|白だし|めんつゆ|酒$|料理酒|和風/,
  },
  {
    cuisine: 'western',
    title:
      /シチュー|ポトフ|グラタン|ミネストローネ|ポタージュ|チャウダー|ハヤシ|ラタトゥイユ|ロールキャベツ|トマト煮|クリーム煮|洋風|リゾット|ピラフ|パスタ|ハンバーグ|コンソメ|(?<!グリーン|レッド|キーマ|バターチキン)カレー/,
    ingredient:
      /コンソメ|ブイヨン|トマト缶|カットトマト|トマトケチャップ|ケチャップ|バター|チーズ|生クリーム|ローリエ|ワイン|デミグラス|ホワイトソース|オリーブ|カレールウ/,
  },
  {
    cuisine: 'chinese',
    title:
      /中華|麻婆|マーボー|八宝菜|酢豚|回鍋肉|ホイコーロー|青椒|チンジャオ|棒棒鶏|バンバンジー|チャーシュー|焼売|シュウマイ|餃子|春雨|担々|坦々|エビチリ|油淋鶏/,
    ingredient: /豆板醤|甜麺醤|オイスター|鶏がら|ガラスープ|中華だし|紹興酒|オイスターソース|花椒|XO/,
  },
  {
    cuisine: 'ethnic',
    title:
      /タイ|ガパオ|グリーンカレー|レッドカレー|トムヤム|フォー|ナシゴレン|ビリヤニ|タンドリー|インド|キーマ|サグ|バターチキン|ケバブ|メキシカン|チリコンカン|ジャンバラヤ|エスニック|韓国|チゲ|サムゲタン|ビビンバ/,
    ingredient:
      /ナンプラー|ココナッツ|クミン|コリアンダー|ガラムマサラ|ターメリック|パクチー|スイートチリ|レモングラス|チリパウダー|カレー粉|コチュジャン/,
  },
]

/** 味の系統: 名前と材料のキーワードを数え、1 位がはっきり多いときだけ決める */
export function inferCuisine(input: Pick<AttributeInput, 'title' | 'ingredients'>): Cuisine | null {
  const title = norm(input.title)
  const names = input.ingredients.map((i) => norm(i.name))
  const scores = CUISINE_RULES.map((rule) => ({
    cuisine: rule.cuisine,
    score: (rule.title.test(title) ? 3 : 0) + names.filter((n) => rule.ingredient.test(n)).length,
  })).sort((a, b) => b.score - a.score)
  const [first, second] = scores
  if (!first || first.score === 0) return null
  if (first.score - (second?.score ?? 0) < CUISINE_MARGIN) return null
  return first.cuisine
}

/**
 * ルールで決められる属性をまとめて出す。given は取り込み元（COCORO の isMixed・調理時間など）の値で、
 * null でなければルールより優先する
 */
export function deriveAttributes(input: AttributeInput, given: Partial<RecipeAttributes> = {}): RecipeAttributes {
  return {
    dishType: given.dishType ?? inferDishType(input),
    cuisine: given.cuisine ?? inferCuisine(input),
    usesMixingUnit: given.usesMixingUnit ?? mixingFromHotcookMode(input.hotcookMode),
    cookMinutes: given.cookMinutes ?? cookMinutesFromHotcookMode(input.hotcookMode),
  }
}
