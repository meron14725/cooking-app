import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'

// Node で動かすテスト（*.node.test.ts は tsconfig.node.json で型チェックする）
// マイグレーションの SQL を SQLite（D1 と同じエンジン）に当てて、制約が効くことを確かめる
const MIGRATIONS_DIR = join(import.meta.dirname, '../../../migrations')

function migrate(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON') // D1 は外部キー制約が常に有効
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const file of files) {
    for (const stmt of readFileSync(join(MIGRATIONS_DIR, file), 'utf8').split('--> statement-breakpoint')) {
      if (stmt.trim()) db.exec(stmt)
    }
  }
  return db
}

let db: DatabaseSync

const insertIngredient = (overrides: Record<string, unknown> = {}) => {
  const row = {
    id: 'ing1',
    name: '玉ねぎ',
    category: 'vegetable',
    unit: '個',
    can_freeze: 1,
    fridge_days: 30,
    freezer_days: 30,
    default_location: 'pantry',
    ...overrides,
  }
  const cols = Object.keys(row)
  db.prepare(`INSERT INTO ingredients (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(
    ...(Object.values(row) as (string | number | null)[]),
  )
}

beforeEach(() => {
  db = migrate()
})

describe('マイグレーション', () => {
  it('11 テーブルができる', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all()
      .map((r) => r.name)
    expect(tables).toEqual([
      'ingredients',
      'inventory_items',
      'meal_kit_items',
      'meal_kits',
      'package_units',
      'plan_recipes',
      'plans',
      'recipe_ingredients',
      'recipe_steps',
      'recipes',
      'shopping_items',
    ])
  })

  it('SQL で直接入れても created_at / updated_at と既定値が入る', () => {
    insertIngredient()
    const row = db.prepare('SELECT * FROM ingredients').get() as Record<string, unknown>
    expect(row.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    expect(row.updated_at).toBe(row.created_at)
    expect(row.aliases).toBe('[]')
    expect(row.is_staple).toBe(0)
  })

  it('recipes.calories_estimated の既定値は 0', () => {
    db.prepare("INSERT INTO recipes (id, title, servings, source_type) VALUES ('r1', 'カレー', 2, 'manual')").run()
    const row = db.prepare('SELECT calories_estimated, pack_seasonings FROM recipes').get() as Record<string, unknown>
    expect(row).toEqual({ calories_estimated: 0, pack_seasonings: 0 })
  })

  it('食材名は重複できない', () => {
    insertIngredient()
    expect(() => insertIngredient({ id: 'ing2' })).toThrow(/UNIQUE/)
  })

  it('売り場の区分は決まった値だけ', () => {
    expect(() => insertIngredient({ category: 'snack' })).toThrow(/CHECK/)
  })

  it('冷凍できない食材は冷凍の日持ちを持てない', () => {
    expect(() => insertIngredient({ can_freeze: 0, freezer_days: 10 })).toThrow(/CHECK/)
    insertIngredient({ can_freeze: 0, freezer_days: null })
  })

  it('存在しない食材を材料にできない（外部キー）', () => {
    db.prepare("INSERT INTO recipes (id, title, servings, source_type) VALUES ('r1', 'カレー', 2, 'manual')").run()
    expect(() =>
      db
        .prepare(
          "INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, display_text) VALUES ('ri1', 'r1', 'nope', 'x')",
        )
        .run(),
    ).toThrow(/FOREIGN KEY/)
  })

  it('レシピを消すと材料と手順も消える', () => {
    insertIngredient()
    db.prepare("INSERT INTO recipes (id, title, servings, source_type) VALUES ('r1', 'カレー', 2, 'manual')").run()
    db.prepare(
      "INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text) VALUES ('ri1', 'r1', 'ing1', 1, '玉ねぎ 1個')",
    ).run()
    db.prepare(
      "INSERT INTO recipe_steps (id, recipe_id, step_no, phase, text) VALUES ('s1', 'r1', 1, 'cook', '入れる')",
    ).run()
    db.prepare("DELETE FROM recipes WHERE id = 'r1'").run()
    expect(db.prepare('SELECT count(*) AS n FROM recipe_ingredients').get()).toEqual({ n: 0 })
    expect(db.prepare('SELECT count(*) AS n FROM recipe_steps').get()).toEqual({ n: 0 })
  })

  it('進行中（draft / shopping / prepping）の献立は 1 つまで。stored や done とは並べられる', () => {
    db.prepare("INSERT INTO plans (id, status) VALUES ('p1', 'stored')").run()
    db.prepare("INSERT INTO plans (id, status) VALUES ('p2', 'done')").run()
    db.prepare("INSERT INTO plans (id, status) VALUES ('p3', 'draft')").run()
    expect(() => db.prepare("INSERT INTO plans (id, status) VALUES ('p4', 'shopping')").run()).toThrow(/UNIQUE/)
    db.prepare("UPDATE plans SET status = 'stored' WHERE id = 'p3'").run()
    db.prepare("INSERT INTO plans (id, status) VALUES ('p4', 'draft')").run()
  })

  it('献立の食数は正、食べる日は 1 以上', () => {
    db.prepare("INSERT INTO plans (id) VALUES ('p1')").run()
    db.prepare("INSERT INTO recipes (id, title, servings, source_type) VALUES ('r1', 'カレー', 2, 'manual')").run()
    const insert = (servings: number, day: number) =>
      db
        .prepare(
          "INSERT INTO plan_recipes (plan_id, recipe_id, role, servings, day_index) VALUES ('p1', 'r1', 'anchor', ?, ?)",
        )
        .run(servings, day)
    expect(() => insert(0, 1)).toThrow(/CHECK/)
    expect(() => insert(1, 0)).toThrow(/CHECK/)
    insert(1, 1)
  })
})
