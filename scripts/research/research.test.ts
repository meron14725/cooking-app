import { beforeEach, describe, expect, it } from 'vitest'
import { createTestApi } from '../../src/server/testing/app'
import type { Ingredient, IngredientInput } from '../../src/shared/schemas/ingredient'
import {
  buildSql,
  type CsvRow,
  checkRows,
  EXPORT_SQL,
  type ExportedIngredient,
  parseCsv,
  parseExport,
  readResearchCsv,
  writeCsv,
} from './research'

let api: ReturnType<typeof createTestApi>
beforeEach(() => {
  api = createTestApi()
})

async function add(input: Partial<IngredientInput> & Pick<IngredientInput, 'name' | 'category' | 'unit'>) {
  const res = await api.call<Ingredient>('POST', '/ingredients', {
    canFreeze: true,
    fridgeDays: 3,
    freezerDays: 30,
    defaultLocation: 'fridge',
    ...input,
  })
  expect(res.status).toBe(201)
  return res.body
}
const exportRows = () => parseExport([{ results: api.sqlite.prepare(EXPORT_SQL).all() }])
const row = (r: Partial<CsvRow> & Pick<CsvRow, 'id' | '名前' | '分類'>): CsvRow => ({
  冷蔵日数: '',
  冷凍可否: '',
  冷凍日数: '',
  常温日数: '',
  保存場所: '',
  価格: '',
  価格の単位: '',
  出典URL: '',
  メモ: '',
  ...r,
})
const get = async (id: string) => (await api.call<Ingredient>('GET', `/ingredients/${id}`)).body

describe('CSV', () => {
  it('" で囲んだカンマ・改行・"" を読み書きできる', () => {
    const rows = [row({ id: 'a', 名前: 'x,"y"', 分類: '野菜', メモ: '1行目\n2行目' })]
    expect(readResearchCsv(writeCsv(rows))).toEqual(rows)
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('見出しが違えば読まない', () => {
    expect(() => readResearchCsv('id,名前\n1,2\n')).toThrow('見出し')
  })
})

describe('checkRows', () => {
  it('範囲外・矛盾・出典なし・分類に合わない値を見つける', () => {
    const { issues } = checkRows([
      row({
        id: '1',
        名前: '塩',
        分類: '調味料',
        冷蔵日数: '2',
        冷凍可否: '不可',
        保存場所: '冷蔵',
        出典URL: 'https://a.example',
      }),
      row({
        id: '2',
        名前: '豚肉',
        分類: '肉',
        冷蔵日数: '3',
        冷凍可否: '不可',
        冷凍日数: '30',
        保存場所: '常温',
        出典URL: '',
      }),
      row({
        id: '3',
        名前: '米',
        分類: '乾物・缶詰',
        常温日数: '4000',
        価格: '30000',
        価格の単位: '1kg',
        出典URL: 'x',
      }),
    ])
    const messages = (id: string) => issues.filter((i) => i.id === id).map((i) => `${i.level}:${i.message}`)
    expect(messages('1')).toEqual([expect.stringMatching(/^warn:調味料にしては冷蔵日数が不自然/)])
    expect(messages('2')).toEqual(
      expect.arrayContaining([
        'error:冷凍不可なのに冷凍日数がある',
        'error:肉なのに保存場所が常温',
        'error:値があるのに出典URL がない',
      ]),
    )
    expect(messages('3')).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^error:出典URL が URL でない/),
        expect.stringMatching(/^error:常温日数 が範囲外/),
        expect.stringMatching(/^error:価格 が範囲外/),
      ]),
    )
  })

  it('空欄だけの行は問題にしない', () => {
    expect(checkRows([row({ id: '1', 名前: '謎', 分類: 'その他', メモ: '見つからない' })]).issues).toEqual([])
  })

  it('調味料・乾物・缶詰は冷凍可否が空でも日持ちを反映する。ほかの分類と、冷凍の値がある行は反映しない', () => {
    const base = { 常温日数: '365', 保存場所: '常温', 出典URL: 'https://a.example' }
    const result = checkRows([
      row({ id: 's', 名前: 'しょうゆ', 分類: '調味料', ...base }),
      row({ id: 'd', 名前: 'さば水煮', 分類: '乾物・缶詰', ...base }),
      row({
        id: 'f',
        名前: 'わかめ',
        分類: '乾物・缶詰',
        冷蔵日数: '30',
        保存場所: '冷蔵',
        出典URL: 'https://a.example',
      }),
      row({ id: 'o', 名前: 'こんにゃく', 分類: 'その他', ...base }),
      row({ id: 'z', 名前: '冷凍うどん', 分類: '調味料', ...base, 保存場所: '冷凍', 常温日数: '' }),
      row({ id: 'y', 名前: 'みそ', 分類: '調味料', ...base, 冷凍日数: '60' }),
    ])
    expect(result.storageRows).toBe(3)
    const warned = result.issues.filter((i) => i.message.startsWith('日持ちがそろっていない')).map((i) => i.id)
    expect(warned.sort()).toEqual(['o', 'y', 'z'])
  })
})

describe('buildSql', () => {
  const now = '2026-11-28T00:00:00.000Z'

  it('日持ちと価格を researched で入れる。手入力は上書きせず、価格は代表量あたりに換算する', async () => {
    const onion = await add({
      name: '玉ねぎ',
      category: 'vegetable',
      unit: '個',
      gramsPerUnit: 200,
      packageUnits: [{ label: '3個入り', quantity: 3, isDefault: true }],
    })
    const pork = await add({ name: '豚こま切れ肉', category: 'meat', unit: 'g', priceYen: 999 })
    const salt = await add({ name: '塩', category: 'seasoning', unit: 'g', isStaple: true })
    // 画面から作ると manual になるので、玉ねぎと塩の日持ちは推定の値だったことにする
    api.sqlite.exec(`UPDATE ingredients SET storage_source = 'rule' WHERE id IN ('${onion.id}', '${salt.id}')`)

    const exported = exportRows()
    expect(exported.find((e) => e.id === onion.id)?.package_units).toContain('3個入り')
    const sql = buildSql(
      [
        row({
          id: onion.id,
          名前: '玉ねぎ',
          分類: '野菜',
          冷蔵日数: '60',
          冷凍可否: '可',
          冷凍日数: '30',
          常温日数: '30',
          保存場所: '常温',
          価格: '50',
          価格の単位: '1個',
          出典URL: 'https://a.example/1 https://a.example/2',
        }),
        row({
          id: pork.id,
          名前: '豚こま切れ肉',
          分類: '肉',
          冷蔵日数: '3',
          冷凍可否: '可',
          冷凍日数: '30',
          保存場所: '冷蔵',
          価格: '198',
          価格の単位: '100g',
          出典URL: 'https://a.example/3',
        }),
        row({
          id: salt.id,
          名前: '塩',
          分類: '調味料',
          冷凍可否: '不可',
          常温日数: '3650',
          保存場所: '常温',
          出典URL: 'https://a.example/4',
        }),
      ],
      exported,
      { now, sourceUrls: false },
    )
    for (const s of sql) api.sqlite.exec(s)

    expect(await get(onion.id)).toMatchObject({
      fridgeDays: 60,
      freezerDays: 30,
      pantryDays: 30,
      defaultLocation: 'pantry',
      storageSource: 'researched',
      // 1個 50円 → 3個入り 150円
      priceYen: 150,
      priceSource: 'researched',
      priceUpdatedAt: now,
    })
    // 日持ちは画面から作った手入力、価格も手入力なので残す
    expect(await get(pork.id)).toMatchObject({
      fridgeDays: 3,
      storageSource: 'manual',
      priceYen: 999,
      priceSource: 'manual',
    })
    // 常温で冷蔵日数が空なら常温日数を使う
    expect(await get(salt.id)).toMatchObject({
      canFreeze: false,
      freezerDays: null,
      fridgeDays: 3650,
      pantryDays: 3650,
      storageSource: 'researched',
    })
  })

  it('調味料・乾物・缶詰で冷凍可否が空なら、冷凍可否と冷凍日数は本番の値のまま残す', async () => {
    const soy = await add({ name: 'しょうゆ', category: 'seasoning', unit: 'mL', canFreeze: true, freezerDays: 90 })
    const salt = await add({ name: '塩', category: 'seasoning', unit: 'g', canFreeze: false, freezerDays: null })
    api.sqlite.exec(`UPDATE ingredients SET storage_source = 'rule' WHERE id IN ('${soy.id}', '${salt.id}')`)
    const sql = buildSql(
      [
        row({
          id: soy.id,
          名前: 'しょうゆ',
          分類: '調味料',
          常温日数: '540',
          保存場所: '常温',
          出典URL: 'https://a.example/1',
        }),
        row({
          id: salt.id,
          名前: '塩',
          分類: '調味料',
          冷蔵日数: '400',
          保存場所: '冷蔵',
          出典URL: 'https://a.example/2',
        }),
      ],
      exportRows(),
      { now, sourceUrls: true },
    )
    expect(sql.join('\n')).not.toMatch(/can_freeze|freezer_days/)
    for (const s of sql) api.sqlite.exec(s)
    expect(await get(soy.id)).toMatchObject({
      canFreeze: true,
      freezerDays: 90,
      fridgeDays: 540,
      pantryDays: 540,
      defaultLocation: 'pantry',
      storageSource: 'researched',
    })
    expect(await get(salt.id)).toMatchObject({
      canFreeze: false,
      freezerDays: null,
      fridgeDays: 400,
      pantryDays: null,
      defaultLocation: 'fridge',
      storageSource: 'researched',
    })
  })

  it('日持ちがそろっていない行は日持ちを反映しない。エラーがあれば SQL を作らない', async () => {
    const x = await add({ name: 'キャベツ', category: 'vegetable', unit: '個' })
    const exported: ExportedIngredient[] = exportRows()
    const partial = row({ id: x.id, 名前: 'キャベツ', 分類: '野菜', 冷蔵日数: '14', 出典URL: 'https://a.example' })
    expect(buildSql([partial], exported, { now, sourceUrls: true })).toEqual([])
    const wrongUnit = row({
      id: x.id,
      名前: 'キャベツ',
      分類: '野菜',
      価格: '200',
      価格の単位: '1玉',
      出典URL: 'https://a.example',
    })
    expect(() => buildSql([wrongUnit], exported, { now, sourceUrls: false })).toThrow('エラー')
  })

  it('販売単位のない書き出し（古い SELECT）では SQL を作らない', async () => {
    const x = await add({ name: 'キャベツ', category: 'vegetable', unit: '個' })
    const exported = exportRows().map(({ package_units: _, ...rest }) => rest) as unknown as ExportedIngredient[]
    const r = row({
      id: x.id,
      名前: 'キャベツ',
      分類: '野菜',
      価格: '200',
      価格の単位: '1個',
      出典URL: 'https://a.example',
    })
    expect(() => buildSql([r], exported, { now, sourceUrls: false })).toThrow('package_units')
  })
})
