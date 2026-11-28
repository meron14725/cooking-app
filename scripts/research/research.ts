// 食材の日持ち・参考価格をウェブで調べた CSV（docs/data/ingredients/*.csv）を確かめ、本番 D1 に反映する SQL を作る。
// 手順は docs/data/README.md。ここは CLI から使う純粋な関数だけを置く（テストは research.test.ts）
import { representativeLabel } from '../../src/shared/domain/cost'
import { representativeQuantity } from '../../src/shared/domain/recommend'
import { CATEGORY_OPTIONS, type Category, categoryLabel } from '../../src/shared/schemas/ingredient'

// ---------- 本番 D1 から書き出した食材 ----------

/**
 * 本番 D1 から食材を書き出す SELECT（docs/data/README.md の手順で使う。1 行で渡すため改行しない）。
 * 販売単位は作った順（cost.ts の representativeLabel と同じ順）の JSON 配列にする
 */
export const EXPORT_SQL =
  "SELECT i.id, i.name, i.aliases, i.category, i.unit, i.grams_per_unit, i.is_staple, i.price_source, i.storage_source, (SELECT json_group_array(json_object('label', p.label, 'quantity', p.quantity, 'isDefault', p.is_default)) FROM (SELECT * FROM package_units p WHERE p.ingredient_id = i.id ORDER BY p.created_at, p.id) p) AS package_units FROM ingredients i WHERE i.archived_at IS NULL ORDER BY i.category, i.name"

/** EXPORT_SQL の 1 行 */
export type ExportedIngredient = {
  id: string
  name: string
  aliases: string
  category: Category
  unit: string
  grams_per_unit: number | null
  is_staple: number
  price_source: string | null
  storage_source: string | null
  /** JSON の配列（[{label, quantity, isDefault}]、作った順） */
  package_units: string | null
}

export type PackageUnitLite = { label: string; quantity: number; isDefault: boolean }

/** `wrangler d1 execute --json` の出力（[{ results: [...] }]）か、行の配列をそのまま受け取る */
export function parseExport(json: unknown): ExportedIngredient[] {
  if (Array.isArray(json) && json.length > 0 && typeof json[0] === 'object' && json[0] && 'results' in json[0]) {
    return json.flatMap((r) => (r as { results: ExportedIngredient[] }).results)
  }
  if (Array.isArray(json)) return json as ExportedIngredient[]
  throw new Error('書き出しの JSON の形が違います（wrangler d1 execute --json の出力を渡してください）')
}

export function packageUnitsOf(row: ExportedIngredient): PackageUnitLite[] {
  if (!row.package_units) return []
  const list = JSON.parse(row.package_units) as { label: string; quantity: number; isDefault: number | boolean }[]
  return list.map((u) => ({ label: u.label, quantity: Number(u.quantity), isDefault: Boolean(u.isDefault) }))
}

/** 価格の単位として受け付けるもの: 代表量（アプリが価格を持つ量）→ その量。基準単位 1 つ（g なら 100g）→ その量 */
export function priceUnits(row: ExportedIngredient): Map<string, number> {
  const ing = { unit: row.unit, packageUnits: packageUnitsOf(row) }
  const units = new Map<string, number>()
  units.set(representativeLabel(ing), representativeQuantity(ing))
  const base = { unit: row.unit, packageUnits: [] }
  units.set(representativeLabel(base), representativeQuantity(base))
  return units
}

/** 調べる前の CSV（id・名前・分類・価格の単位だけ入れたもの）を作るときの価格の単位 */
export function defaultPriceUnit(row: ExportedIngredient): string {
  return representativeLabel({ unit: row.unit, packageUnits: packageUnitsOf(row) })
}

// ---------- CSV ----------

export const CSV_COLUMNS = [
  'id',
  '名前',
  '分類',
  '冷蔵日数',
  '冷凍可否',
  '冷凍日数',
  '常温日数',
  '保存場所',
  '価格',
  '価格の単位',
  '出典URL',
  'メモ',
] as const
export type CsvColumn = (typeof CSV_COLUMNS)[number]
export type CsvRow = Record<CsvColumn, string>

/** RFC 4180 の CSV（"" で囲む・"" で " を表す・囲みの中の改行）を読む */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''))
}

export function readResearchCsv(text: string): CsvRow[] {
  const [header, ...body] = parseCsv(text)
  if (!header || header.join(',') !== CSV_COLUMNS.join(',')) {
    throw new Error(`CSV の見出しが違います。期待: ${CSV_COLUMNS.join(',')}`)
  }
  return body.map((cells) => {
    if (cells.length !== CSV_COLUMNS.length) {
      throw new Error(`列の数が違う行があります（${cells.length} 列）: ${cells.join(',')}`)
    }
    return Object.fromEntries(CSV_COLUMNS.map((c, i) => [c, (cells[i] ?? '').trim()])) as CsvRow
  })
}

const csvField = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
export function writeCsv(rows: CsvRow[]): string {
  return `${[CSV_COLUMNS.join(','), ...rows.map((r) => CSV_COLUMNS.map((c) => csvField(r[c] ?? '')).join(','))].join('\n')}\n`
}

// ---------- 値の読み取り ----------

export const DAYS_MIN = 0
export const DAYS_MAX = 3650
export const PRICE_MIN_YEN = 1
export const PRICE_MAX_YEN = 20_000

const LOCATIONS = { 冷蔵: 'fridge', 冷凍: 'freezer', 常温: 'pantry' } as const
const FREEZE = { 可: true, 不可: false } as const

export type Parsed = {
  fridgeDays: number | null
  canFreeze: boolean | null
  freezerDays: number | null
  pantryDays: number | null
  location: 'fridge' | 'freezer' | 'pantry' | null
  priceYen: number | null
  priceUnit: string
  urls: string[]
}

export type Issue = { id: string; name: string; level: 'error' | 'warn'; message: string }

function parseRow(row: CsvRow, issues: Issue[]): Parsed {
  const issue = (level: Issue['level'], message: string) => issues.push({ id: row.id, name: row.名前, level, message })
  const int = (col: CsvColumn, min: number, max: number) => {
    const v = row[col]
    if (v === '') return null
    const n = Number(v)
    if (!Number.isInteger(n)) {
      issue('error', `${col} が整数でない: ${v}`)
      return null
    }
    if (n < min || n > max) {
      issue('error', `${col} が範囲外（${min}〜${max}）: ${v}`)
      return null
    }
    return n
  }
  const pick = <T>(col: CsvColumn, map: Record<string, T>): T | null => {
    const v = row[col]
    if (v === '') return null
    if (!(v in map)) {
      issue('error', `${col} は ${Object.keys(map).join(' / ')} か空欄: ${v}`)
      return null
    }
    return map[v] ?? null
  }
  const urls = row.出典URL.split(/\s+/).filter(Boolean)
  for (const u of urls) {
    if (!/^https?:\/\/\S+$/.test(u)) issue('error', `出典URL が URL でない: ${u}`)
  }
  return {
    fridgeDays: int('冷蔵日数', DAYS_MIN, DAYS_MAX),
    canFreeze: pick('冷凍可否', FREEZE),
    freezerDays: int('冷凍日数', DAYS_MIN, DAYS_MAX),
    pantryDays: int('常温日数', DAYS_MIN, DAYS_MAX),
    location: pick('保存場所', LOCATIONS),
    priceYen: int('価格', PRICE_MIN_YEN, PRICE_MAX_YEN),
    priceUnit: row.価格の単位,
    urls,
  }
}

const hasStorageValue = (p: Parsed) =>
  p.fridgeDays !== null ||
  p.canFreeze !== null ||
  p.freezerDays !== null ||
  p.pantryDays !== null ||
  p.location !== null

/**
 * 冷凍可否に出典がなくても日持ちを反映する分類（ユーザー決定 2026-11-28）。メーカーが未開封の賞味期限だけを
 * 公表していて冷凍の可否を書かないことが多いため。この分類で冷凍可否が空なら、保存場所と冷蔵日数（常温なら常温日数）
 * だけを入れ、冷凍可否・冷凍日数は本番の値のまま触らない
 */
export const FREEZE_OPTIONAL_CATEGORIES: ReadonlySet<Category> = new Set<Category>(['seasoning', 'dry'])

/**
 * 日持ちを反映できるだけそろっているか。保存場所・冷凍可否は必須（FREEZE_OPTIONAL_CATEGORIES は冷凍可否なしでよい。
 * ただし保存場所が冷凍・冷凍日数だけある行は除く）。冷蔵日数は必須（常温保存で空なら常温日数を使う。
 * アプリの辞書と同じ「常温で持つ食材は冷蔵でも同じ日数持つ」扱い）。冷凍できるなら冷凍日数、常温保存なら常温日数も必須
 */
export function storageComplete(p: Parsed, category?: Category): boolean {
  if (p.location === null) return false
  if (p.canFreeze === null) {
    if (!category || !FREEZE_OPTIONAL_CATEGORIES.has(category)) return false
    if (p.location === 'freezer' || p.freezerDays !== null) return false
  }
  if (p.fridgeDays === null && !(p.location === 'pantry' && p.pantryDays !== null)) return false
  if (p.canFreeze && p.freezerDays === null) return false
  if (p.location === 'pantry' && p.pantryDays === null) return false
  return true
}

/** CSV の分類列（「調味料」など）→ 分類の値 */
export const categoryOfLabel = (label: string): Category | undefined =>
  CATEGORY_OPTIONS.find((o) => o.label === label)?.value

/** 分類ごとの、ありそうな日持ちの幅（外れたら警告。値は捨てない） */
const PLAUSIBLE_FRIDGE: Partial<Record<Category, [number, number]>> = {
  vegetable: [1, 180],
  meat: [1, 14],
  fish: [1, 14],
  tofu_egg_dairy: [1, 180],
  seasoning: [14, DAYS_MAX],
  dry: [14, DAYS_MAX],
}

// ---------- 確かめる ----------

export type CheckResult = {
  rows: number
  storageRows: number
  priceRows: number
  issues: Issue[]
  parsed: Map<string, Parsed>
}

export function checkRows(rows: CsvRow[], exported?: ExportedIngredient[]): CheckResult {
  const issues: Issue[] = []
  const parsed = new Map<string, Parsed>()
  const byId = exported ? new Map(exported.map((e) => [e.id, e])) : null
  const seen = new Set<string>()
  let storageRows = 0
  let priceRows = 0
  for (const row of rows) {
    const issue = (level: Issue['level'], message: string) =>
      issues.push({ id: row.id, name: row.名前, level, message })
    if (seen.has(row.id)) issue('error', 'id が重複している')
    seen.add(row.id)
    const p = parseRow(row, issues)
    parsed.set(row.id, p)

    const category = categoryOfLabel(row.分類)
    if (!category) issue('error', `分類が分からない: ${row.分類}`)

    const exp = byId?.get(row.id)
    if (byId && !exp) issue('error', '本番の書き出しにない id（削除済みか、別の DB）')
    if (exp && exp.name !== row.名前) issue('warn', `名前が本番と違う（本番: ${exp.name}）`)
    if (exp && categoryLabel(exp.category) !== row.分類) {
      issue('warn', `分類が本番と違う（本番: ${categoryLabel(exp.category)}）`)
    }

    // 日持ち
    if (hasStorageValue(p)) {
      if (p.canFreeze === false && p.freezerDays !== null) issue('error', '冷凍不可なのに冷凍日数がある')
      if (p.location === 'freezer' && p.canFreeze === false) issue('error', '冷凍不可なのに保存場所が冷凍')
      if (p.canFreeze && p.freezerDays !== null && p.fridgeDays !== null && p.freezerDays < p.fridgeDays) {
        issue('warn', '冷凍日数が冷蔵日数より短い')
      }
      const range = category ? PLAUSIBLE_FRIDGE[category] : undefined
      if (range && p.fridgeDays !== null && (p.fridgeDays < range[0] || p.fridgeDays > range[1])) {
        issue('warn', `${row.分類}にしては冷蔵日数が不自然（${range[0]}〜${range[1]} 日の外）: ${p.fridgeDays}`)
      }
      if ((category === 'meat' || category === 'fish') && p.location === 'pantry') {
        issue('error', `${row.分類}なのに保存場所が常温`)
      }
      if (storageComplete(p, category)) storageRows++
      else
        issue(
          'warn',
          '日持ちがそろっていないので反映しない（保存場所・冷凍可否〈調味料・乾物・缶詰はなくてよい〉・冷蔵日数、冷凍可なら冷凍日数、常温なら常温日数）',
        )
    }

    // 価格
    if (p.priceYen !== null) {
      if (exp) {
        const units = priceUnits(exp)
        if (!units.has(p.priceUnit)) {
          issue(
            'error',
            `価格の単位がアプリの量と合わない: ${p.priceUnit}（使える単位: ${[...units.keys()].join(' / ')}）`,
          )
        } else priceRows++
      } else if (p.priceUnit === '') issue('error', '価格の単位が空')
      else priceRows++
    }

    if ((hasStorageValue(p) || p.priceYen !== null) && p.urls.length === 0) issue('error', '値があるのに出典URL がない')
  }
  return { rows: rows.length, storageRows, priceRows, issues, parsed }
}

// ---------- 反映する SQL ----------

const lit = (v: string | number | boolean | null) => {
  if (v === null) return 'NULL'
  if (typeof v === 'boolean') return v ? '1' : '0'
  if (typeof v === 'number') return String(v)
  return `'${v.replace(/'/g, "''")}'`
}

export type SqlOptions = {
  /** price_updated_at / updated_at に入れる日時 */
  now: string
  /** price_source_urls / storage_source_urls（migration 0012）に出典を入れる */
  sourceUrls: boolean
}

export const MAX_SOURCE_URLS = 3

/**
 * 反映する UPDATE 文。バインド変数は使わない（D1 の 1 クエリ 100 変数の上限に当たらない）。
 * 手入力（manual）の値は WHERE で除く。削除済みの食材も除く。切った後の日持ち（prepped_*）は触らない
 */
export function buildSql(rows: CsvRow[], exported: ExportedIngredient[], opts: SqlOptions): string[] {
  if (exported.some((e) => !('package_units' in e))) {
    // 販売単位がないと代表量が分からず、価格を基準単位あたりのまま入れてしまう
    throw new Error('書き出しに package_units がありません。docs/data/README.md の SELECT で書き出し直してください')
  }
  const { parsed, issues } = checkRows(rows, exported)
  const bad = new Set(issues.filter((i) => i.level === 'error').map((i) => i.id))
  if (bad.size > 0) throw new Error(`エラーのある行があります（${bad.size} 件）。先に research:check で直してください`)
  const byId = new Map(exported.map((e) => [e.id, e]))
  const statements: string[] = []
  for (const row of rows) {
    const p = parsed.get(row.id)
    const exp = byId.get(row.id)
    if (!p || !exp) continue
    const urls = JSON.stringify(p.urls.slice(0, MAX_SOURCE_URLS))
    if (storageComplete(p, categoryOfLabel(row.分類))) {
      // 冷凍可否が空（FREEZE_OPTIONAL_CATEGORIES）なら、冷凍可否・冷凍日数は本番の値のまま
      const freeze =
        p.canFreeze === null
          ? []
          : [
              `can_freeze = ${lit(p.canFreeze)}`,
              `freezer_days = ${lit(p.canFreeze ? p.freezerDays : null)}`,
              ...(p.canFreeze ? [] : ['prepped_freezer_days = NULL']),
            ]
      const set = [
        ...freeze,
        `fridge_days = ${lit(p.fridgeDays ?? p.pantryDays)}`,
        `pantry_days = ${lit(p.pantryDays)}`,
        `default_location = ${lit(p.location)}`,
        `storage_source = 'researched'`,
        ...(opts.sourceUrls ? [`storage_source_urls = ${lit(urls)}`] : []),
        `updated_at = ${lit(opts.now)}`,
      ]
      statements.push(
        `UPDATE ingredients SET ${set.join(', ')} WHERE id = ${lit(row.id)} AND archived_at IS NULL AND (storage_source IS NULL OR storage_source <> 'manual');`,
      )
    }
    if (p.priceYen !== null) {
      const units = priceUnits(exp)
      const from = units.get(p.priceUnit)
      const rep = representativeQuantity({ unit: exp.unit, packageUnits: packageUnitsOf(exp) })
      if (from === undefined) continue
      // 代表量あたりに換算（アプリは代表量あたりの価格を持つ。docs/design/10-cost.md）
      const yen = Math.max(1, Math.round((p.priceYen * rep) / from))
      const set = [
        `price_yen = ${yen}`,
        `price_source = 'researched'`,
        `price_updated_at = ${lit(opts.now)}`,
        ...(opts.sourceUrls ? [`price_source_urls = ${lit(urls)}`] : []),
        `updated_at = ${lit(opts.now)}`,
      ]
      statements.push(
        `UPDATE ingredients SET ${set.join(', ')} WHERE id = ${lit(row.id)} AND archived_at IS NULL AND (price_source IS NULL OR price_source <> 'manual');`,
      )
    }
  }
  return statements
}
