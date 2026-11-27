/**
 * 量を食材マスタの基準単位に直す（docs/design/02-data-model.md「単位の扱い」）。
 * URL 取り込み・AI 提案・手登録で共通に使う純粋関数。
 */

export type UnitMaster = {
  name: string
  /** 基準単位 */
  unit: string
  /** 基準単位 1 つあたりのおよその重さ（g） */
  gramsPerUnit: number | null
}

export type ConvertResult = { quantity: number; warning: null } | { quantity: null; warning: string }

/** 体積の単位を ml に直すときの倍率 */
const ML_PER: Record<string, number> = {
  ml: 1,
  大さじ: 15,
  小さじ: 5,
  カップ: 200,
}

/** 表記ゆれをそろえる（g / ml / kg / L と大さじ・小さじ・カップ） */
export function normalizeUnit(unit: string): string {
  const u = unit.normalize('NFKC').trim()
  const lower = u.toLowerCase()
  if (lower === 'g' || u === 'グラム') return 'g'
  if (lower === 'kg' || u === 'キロ' || u === 'キログラム') return 'kg'
  if (lower === 'ml' || lower === 'cc' || u === 'ミリリットル') return 'ml'
  if (lower === 'l' || u === 'リットル') return 'l'
  if (u === '大匙' || u === '大') return '大さじ'
  if (u === '小匙' || u === '小') return '小さじ'
  if (u === 'cup') return 'カップ'
  return u
}

/** 小数第 2 位までに丸める（0.666… → 0.67） */
export function roundQuantity(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * `quantity unit` をマスタの基準単位での量に直す。
 * - 単位が基準単位と同じ → そのまま
 * - g / kg → 基準単位が g ならそのまま、そうでなければ grams_per_unit で割る
 * - ml / L / 大さじ / 小さじ / カップ → 基準単位が ml なら ml に直す
 * - それ以外 → 直せないので quantity = null と警告を返す
 */
export function toBaseQuantity(amount: { quantity: number; unit: string }, master: UnitMaster): ConvertResult {
  const from = normalizeUnit(amount.unit)
  const base = normalizeUnit(master.unit)
  if (from === base) return { quantity: roundQuantity(amount.quantity), warning: null }

  const grams = from === 'g' ? amount.quantity : from === 'kg' ? amount.quantity * 1000 : null
  if (grams !== null) {
    if (base === 'g') return { quantity: roundQuantity(grams), warning: null }
    if (base === 'kg') return { quantity: roundQuantity(grams / 1000), warning: null }
    if (master.gramsPerUnit) return { quantity: roundQuantity(grams / master.gramsPerUnit), warning: null }
  }

  const ml = from === 'l' ? amount.quantity * 1000 : from in ML_PER ? amount.quantity * (ML_PER[from] ?? 1) : null
  if (ml !== null && base === 'ml') return { quantity: roundQuantity(ml), warning: null }

  return {
    quantity: null,
    warning: `「${master.name}」の量（${amount.quantity}${amount.unit}）を${master.unit}に直せませんでした。単位を確認してください`,
  }
}

/** 基準単位から g 表記に戻す（画面で「約 300g」と添える用）。直せなければ null */
export function toGrams(quantity: number, master: UnitMaster): number | null {
  const base = normalizeUnit(master.unit)
  if (base === 'g') return quantity
  if (base === 'kg') return quantity * 1000
  return master.gramsPerUnit ? Math.round(quantity * master.gramsPerUnit) : null
}
