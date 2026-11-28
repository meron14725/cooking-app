/**
 * 食材の日持ち（冷蔵・冷凍・常温・切った後）と保存場所を、名前と分類から AI を使わずに決める
 * （docs/design/11-storage-days.md）。決められなければ null を返し、AI に回す。
 * 分類の段（09）のあとに使う前提で、分類ごとに名前の辞書を引く。初期データ（seed/ingredients.ts）の食材は、
 * 初期データと同じ値になる（seed/storageRules.test.ts で確かめる）
 */
import type { Category, StorageLocation } from '../schemas/ingredient'

export type StorageValues = {
  canFreeze: boolean
  /** 丸ごと・未開封で冷蔵したときの日持ち（日） */
  fridgeDays: number
  freezerDays: number | null
  pantryDays: number | null
  defaultLocation: StorageLocation
  preppedFridgeDays: number | null
  preppedFreezerDays: number | null
}

/** 冷蔵で持つ食材（冷凍の日持ちを null にすると冷凍できない） */
const fridge = (fridgeDays: number, freezerDays: number | null = 30, extra: Partial<StorageValues> = {}) =>
  ({
    canFreeze: freezerDays !== null,
    fridgeDays,
    freezerDays,
    pantryDays: null,
    defaultLocation: 'fridge',
    preppedFridgeDays: null,
    preppedFreezerDays: null,
    ...extra,
  }) satisfies StorageValues

/** 常温で持つ食材（冷蔵でも同じ日数持つとみなす） */
const pantry = (days: number, extra: Partial<StorageValues> = {}) =>
  ({
    canFreeze: false,
    fridgeDays: days,
    freezerDays: null,
    pantryDays: days,
    defaultLocation: 'pantry',
    preppedFridgeDays: null,
    preppedFreezerDays: null,
    ...extra,
  }) satisfies StorageValues

type StorageRule = { categories: Category[]; pattern: RegExp; values: StorageValues }
const r = (categories: Category[], pattern: RegExp, values: StorageValues): StorageRule => ({
  categories,
  pattern,
  values,
})

const VEG: Category[] = ['vegetable']
const SEASONING: Category[] = ['seasoning']
const DRY_OTHER: Category[] = ['dry', 'other']

/** 上から順に見る。分類が合わない行は飛ばす（「塩さば」を調味料の「塩」にしないため） */
export const STORAGE_RULES: StorageRule[] = [
  // ---------- 野菜 ----------
  r(VEG, /玉ねぎ|たまねぎ|タマネギ/, pantry(30, { canFreeze: true, fridgeDays: 60, freezerDays: 30 })),
  r(VEG, /じゃがいも|ジャガイモ|馬鈴薯/, pantry(30, { fridgeDays: 30 })),
  r(VEG, /さつまいも|さつま芋/, pantry(30, { canFreeze: true, fridgeDays: 14, freezerDays: 30 })),
  r(VEG, /にんじん|人参|ニンジン/, fridge(21)),
  r(VEG, /キャベツ|白菜/, fridge(14)),
  r(VEG, /しょうが|生姜|ショウガ/, fridge(14)),
  r(VEG, /にんにく|ニンニク/, fridge(30)),
  r(VEG, /長芋|長いも|山芋|大和芋/, fridge(14)),
  r(VEG, /大根|ピーマン|パプリカ/, fridge(10)),
  r(VEG, /長ねぎ|長ネギ|白ねぎ|ねぎ|ネギ/, fridge(10)),
  r(VEG, /トマト|ごぼう|牛蒡|れんこん|蓮根|セロリ|里芋|さといも|みょうが/, fridge(7)),
  r(VEG, /もやし/, fridge(2, 21, { preppedFridgeDays: 1 })),
  r(VEG, /ほうれん草|ほうれんそう|小松菜|水菜|春菊|ニラ|にら|三つ葉|大葉|しそ|豆苗|貝割れ|かいわれ|パセリ/, fridge(3)),
  r(VEG, /チンゲン菜|青梗菜|まいたけ|舞茸|アスパラ|オクラ|いんげん/, fridge(4)),
  r(
    VEG,
    /かぼちゃ|南瓜|ブロッコリー|カリフラワー|なす|茄子|しめじ|えのき|しいたけ|椎茸|エリンギ|マッシュルーム|きゅうり|胡瓜|レタス|ズッキーニ|かぶ/,
    fridge(5),
  ),
  r(VEG, /枝豆|とうもろこし/, fridge(2)),
  // ---------- 肉・魚 ----------
  r(['meat'], /ひき|挽|ミンチ/, fridge(1)),
  r(['meat'], /ベーコン|ハム/, fridge(7)),
  r(['meat'], /ウインナー|ウィンナー|ソーセージ/, fridge(10)),
  r(['meat'], /./, fridge(2)),
  r(['fish'], /シーフードミックス|冷凍/, fridge(1, 30, { defaultLocation: 'freezer' })),
  r(['fish'], /ツナ|缶/, pantry(365)),
  r(['fish'], /ちくわ|かまぼこ|はんぺん/, fridge(7)),
  r(['fish'], /しらす|ちりめん|たらこ|明太/, fridge(3)),
  r(['fish'], /./, fridge(2)),
  // ---------- 大豆製品・卵・乳製品 ----------
  r(['tofu_egg_dairy'], /厚揚げ|油揚げ|がんも/, fridge(4)),
  r(['tofu_egg_dairy'], /(?<!高野)豆腐/, fridge(5, null)),
  r(['tofu_egg_dairy'], /卵|たまご|玉子/, fridge(14, null)),
  r(['tofu_egg_dairy'], /牛乳|豆乳/, fridge(7, null)),
  r(['tofu_egg_dairy'], /チーズ/, fridge(14)),
  r(['tofu_egg_dairy'], /納豆/, fridge(7)),
  r(['tofu_egg_dairy'], /ヨーグルト/, fridge(10, null)),
  r(['tofu_egg_dairy'], /生クリーム/, fridge(5, null)),
  // ---------- 調味料 ----------
  r(SEASONING, /^(砂糖|塩)$|グラニュー糖|上白糖|三温糖|きび糖|粗塩|食塩/, pantry(3650)),
  r(SEASONING, /バター/, fridge(180, 90)),
  r(
    SEASONING,
    /味噌|みそ|ケチャップ|マヨネーズ|オイスター|めんつゆ|ポン酢|ぽん酢|チューブ|豆板醤|甜麺醤|コチュジャン|ジャム/,
    fridge(180, null),
  ),
  r(SEASONING, /./, pantry(180)),
  // ---------- 乾物・缶詰・そのほか ----------
  r(DRY_OTHER, /缶/, pantry(365, { canFreeze: true, freezerDays: 30, preppedFridgeDays: 3 })),
  r(DRY_OTHER, /ルウ|ルー|春雨|はるさめ|パスタ|スパゲ|マカロニ/, pantry(365)),
  r(['dry'], /./, pantry(180)),
  r(['other'], /こんにゃく|蒟蒻|しらたき|白滝/, fridge(30, null)),
]

const norm = (s: string) => s.normalize('NFKC').trim()

export type StorageRuleInput = { name: string; aliases: string[]; category: Category }

/** 名前と分類から日持ちを決める。当たらなければ null（AI に回す） */
export function storageByRule(ing: StorageRuleInput): StorageValues | null {
  const names = [ing.name, ...ing.aliases].map(norm)
  const rule = STORAGE_RULES.find((x) => x.categories.includes(ing.category) && names.some((n) => x.pattern.test(n)))
  return rule ? { ...rule.values } : null
}

/** AI の答えで保存してよい日数の上限（日） */
export const AI_STORAGE_MAX_DAYS = 365

/**
 * AI の答えを確かめる。日数は 0〜365 の整数（冷蔵は必須、ほかは null 可）。冷凍できなければ冷凍の日数は null、
 * 冷凍保存は冷凍できるときだけ、常温保存は常温の日数があるときだけ。合わなければ null（保存しない）
 */
export function validStorage(answer: unknown): StorageValues | null {
  if (typeof answer !== 'object' || answer === null) return null
  const a = answer as Record<string, unknown>
  const day = (v: unknown, nullable: boolean): number | null | undefined => {
    if (v === null || v === undefined) return nullable ? null : undefined
    return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= AI_STORAGE_MAX_DAYS ? v : undefined
  }
  if (typeof a.canFreeze !== 'boolean') return null
  if (a.defaultLocation !== 'fridge' && a.defaultLocation !== 'freezer' && a.defaultLocation !== 'pantry') return null
  const fridgeDays = day(a.fridgeDays, false)
  const freezerDays = day(a.freezerDays, true)
  const pantryDays = day(a.pantryDays, true)
  const preppedFridgeDays = day(a.preppedFridgeDays, true)
  const preppedFreezerDays = day(a.preppedFreezerDays, true)
  if (
    fridgeDays === undefined ||
    fridgeDays === null ||
    freezerDays === undefined ||
    pantryDays === undefined ||
    preppedFridgeDays === undefined ||
    preppedFreezerDays === undefined
  ) {
    return null
  }
  const canFreeze = a.canFreeze
  if (canFreeze && freezerDays === null) return null
  if (!canFreeze && a.defaultLocation === 'freezer') return null
  if (a.defaultLocation === 'pantry' && pantryDays === null) return null
  return {
    canFreeze,
    fridgeDays,
    // 冷凍できないなら冷凍の日数は持たない
    freezerDays: canFreeze ? freezerDays : null,
    pantryDays,
    defaultLocation: a.defaultLocation,
    preppedFridgeDays,
    preppedFreezerDays: canFreeze ? preppedFreezerDays : null,
  }
}
