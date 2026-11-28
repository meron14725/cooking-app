// docs/data/fixes/ の、本番 D1 の食材マスタを直す SQL を、テスト用の D1 で流して確かめる
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createTestD1 } from '../../src/server/testing/d1'

const FIXES_DIR = join(import.meta.dirname, '../../docs/data/fixes')
const files = readdirSync(FIXES_DIR).filter((f) => f.endsWith('.sql'))
const sqlOf = (file: string) => readFileSync(join(FIXES_DIR, file), 'utf8')

type Row = {
  id: string
  name: string
  aliases: string
  category: string
  attributes_source: string | null
  storage_source: string | null
  storage_source_urls: string
  price_yen: number | null
  price_source: string | null
  archived_at: string | null
}

function setup(rows: (Partial<Row> & Pick<Row, 'id' | 'name' | 'category'>)[]) {
  const db = createTestD1({ seed: false }).sqlite
  const insert = db.prepare(
    `INSERT INTO ingredients (id, name, aliases, category, unit, can_freeze, fridge_days, default_location,
       attributes_source, storage_source, storage_source_urls, price_yen, price_source, archived_at)
     VALUES (?, ?, ?, ?, 'g', 1, 3, 'fridge', ?, ?, ?, ?, ?, ?)`,
  )
  for (const r of rows) {
    insert.run(
      r.id,
      r.name,
      r.aliases ?? '[]',
      r.category,
      r.attributes_source === undefined ? 'rule' : r.attributes_source,
      r.storage_source === undefined ? 'rule' : r.storage_source,
      r.storage_source_urls ?? '["https://example.com/storage"]',
      r.price_yen ?? null,
      r.price_source ?? null,
      r.archived_at ?? null,
    )
  }
  return {
    run: (file: string) => db.exec(sqlOf(file)),
    get: (id: string) => db.prepare('SELECT * FROM ingredients WHERE id = ?').get(id) as Row,
  }
}

describe.each(files)('%s', (file) => {
  const sql = sqlOf(file)
  const statements = sql.split('\n').filter((l) => l.startsWith('UPDATE '))

  it('1 行 1 つの UPDATE で、id ごとに 1 文。バインド変数を使わない', () => {
    expect(statements.length).toBeGreaterThan(0)
    const ids = statements.map((s) => s.match(/WHERE id = '([^']+)'/)?.[1])
    expect(ids.every(Boolean)).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
    expect(sql).not.toMatch(/\?/)
    for (const s of statements) expect(s).toMatch(/archived_at IS NULL/)
  })

  it('対象の食材がなくても失敗しない。2 回流しても同じ', () => {
    const t = setup([])
    t.run(file)
    t.run(file)
  })
})

describe('2026-11-28-names-categories.sql', () => {
  const file = '2026-11-28-names-categories.sql'

  it('名前を直し、前の名前を別名に残す。同じ名前の食材がある・名前が手で変わっているときは直さない', () => {
    const t = setup([
      { id: 'cocoro-ing-86f9291b03fada7c', name: 'だこ', aliases: '["ゆでだこ"]', category: 'fish' },
      { id: 'cocoro-ing-805f098baf856ecc', name: 'たオクラ(飾り用)', category: 'vegetable' },
      { id: 'x-hatomugi', name: 'はと麦茶', category: 'other' },
      { id: 'cocoro-ing-d83186c382956785', name: 'はと麦茶※', category: 'other' },
    ])
    t.run(file)
    expect(t.get('cocoro-ing-86f9291b03fada7c')).toMatchObject({ name: 'ゆでだこ', aliases: '["ゆでだこ","だこ"]' })
    t.run(file)
    expect(t.get('cocoro-ing-86f9291b03fada7c').aliases).toBe('["ゆでだこ","だこ"]')
    expect(t.get('cocoro-ing-805f098baf856ecc')).toMatchObject({
      name: 'ゆでたオクラ(飾り用)',
      aliases: '["たオクラ(飾り用)"]',
    })
    // 「はと麦茶」がもうあるので「はと麦茶※」は直さない（名前は重ならない）
    expect(t.get('cocoro-ing-d83186c382956785')).toMatchObject({ name: 'はと麦茶※', aliases: '[]' })
  })

  it('名前が書き出しと違えば直さない', () => {
    const t = setup([{ id: 'cocoro-ing-86f9291b03fada7c', name: 'たこ', category: 'fish' }])
    t.run(file)
    expect(t.get('cocoro-ing-86f9291b03fada7c')).toMatchObject({ name: 'たこ', aliases: '[]' })
  })

  it('分類を直し、手直しの印（manual）を付ける。rule・ai の日持ちは未見直しに戻して出典を空にし、manual・researched（出典ごと）と価格は残す', () => {
    const t = setup([
      // はごろもフーズ シーチキンL（肉 → 魚）
      {
        id: 'cocoro-ing-ddf0221dc4ddb6c0',
        name: 'シーチキンL',
        category: 'meat',
        price_yen: 200,
        price_source: 'default',
      },
      // 森永のおいしい牛乳（肉 → 豆腐・卵・乳製品）
      {
        id: 'cocoro-ing-a82ea8c2a576bcac',
        name: '牛乳',
        category: 'meat',
        storage_source: 'researched',
        price_source: 'researched',
        price_yen: 250,
      },
      // 梅肉（肉 → 調味料）
      {
        id: 'cocoro-ing-ad648b690e61443d',
        name: '梅肉',
        category: 'meat',
        storage_source: 'manual',
        attributes_source: 'ai',
      },
      // セルフィーユ（その他 → 野菜）
      {
        id: 'cocoro-ing-32d8c87c762eecd0',
        name: 'セルフィーユ',
        category: 'other',
        storage_source: 'ai',
        attributes_source: null,
      },
    ])
    t.run(file)
    expect(t.get('cocoro-ing-ddf0221dc4ddb6c0')).toMatchObject({
      category: 'fish',
      attributes_source: 'manual',
      storage_source: null,
      storage_source_urls: '[]',
      price_yen: 200,
      price_source: 'default',
    })
    expect(t.get('cocoro-ing-a82ea8c2a576bcac')).toMatchObject({
      category: 'tofu_egg_dairy',
      storage_source: 'researched',
      storage_source_urls: '["https://example.com/storage"]',
      price_source: 'researched',
      price_yen: 250,
    })
    expect(t.get('cocoro-ing-ad648b690e61443d')).toMatchObject({
      category: 'seasoning',
      storage_source: 'manual',
      storage_source_urls: '["https://example.com/storage"]',
    })
    expect(t.get('cocoro-ing-32d8c87c762eecd0')).toMatchObject({
      category: 'vegetable',
      attributes_source: 'manual',
      storage_source: null,
      storage_source_urls: '[]',
    })
  })

  it('手で分類を直した食材（attributes_source = manual）・分類が書き出しと違う食材・削除済みの食材は変えない', () => {
    const t = setup([
      { id: 'cocoro-ing-ddf0221dc4ddb6c0', name: 'シーチキンL', category: 'meat', attributes_source: 'manual' },
      { id: 'cocoro-ing-a82ea8c2a576bcac', name: '牛乳', category: 'other' },
      { id: 'cocoro-ing-ad648b690e61443d', name: '梅肉', category: 'meat', archived_at: '2026-11-01T00:00:00.000Z' },
    ])
    t.run(file)
    expect(t.get('cocoro-ing-ddf0221dc4ddb6c0')).toMatchObject({
      category: 'meat',
      storage_source: 'rule',
      storage_source_urls: '["https://example.com/storage"]',
    })
    expect(t.get('cocoro-ing-a82ea8c2a576bcac')).toMatchObject({ category: 'other', attributes_source: 'rule' })
    expect(t.get('cocoro-ing-ad648b690e61443d')).toMatchObject({ category: 'meat', storage_source: 'rule' })
  })
})
