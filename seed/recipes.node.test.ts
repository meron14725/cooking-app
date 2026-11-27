import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createTestD1, MIGRATIONS_DIR } from '../src/server/testing/d1'
import { ingredientSeeds } from './ingredients'
import { recipeSeedId, recipeSeedToInput } from './recipe-input'
import { recipeSeeds } from './recipes'

const count = (db: ReturnType<typeof createTestD1>['sqlite'], table: string) =>
  (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n

describe('基本レシピの初期データ', () => {
  it('10〜20 件あり、key とタイトルが重複しない', () => {
    expect(recipeSeeds.length).toBeGreaterThanOrEqual(10)
    expect(recipeSeeds.length).toBeLessThanOrEqual(20)
    expect(new Set(recipeSeeds.map((s) => s.key)).size).toBe(recipeSeeds.length)
    expect(new Set(recipeSeeds.map((s) => s.title)).size).toBe(recipeSeeds.length)
    for (const s of recipeSeeds) expect(s.key).toMatch(/^[a-z0-9-]+$/)
  })

  it('材料はすべて食材マスタの初期データにあり、入力の検証を通る', () => {
    const names = new Set(ingredientSeeds.map((s) => s.name))
    for (const seed of recipeSeeds) {
      const missing = seed.ingredients.map((i) => i.name).filter((n) => !names.has(n))
      expect(missing, seed.title).toEqual([])
      expect(() => recipeSeedToInput(seed, (n) => n), seed.title).not.toThrow()
    }
  })

  it('1.6L で作れる人数は 1 以上', () => {
    for (const seed of recipeSeeds) expect(seed.maxServings1_6l, seed.title).toBeGreaterThanOrEqual(1)
  })

  it('マイグレーションで材料と手順まで全件入る', () => {
    const db = createTestD1().sqlite
    expect(count(db, 'recipes')).toBe(recipeSeeds.length)
    expect(count(db, 'recipe_ingredients')).toBe(recipeSeeds.reduce((n, s) => n + s.ingredients.length, 0))
    expect(count(db, 'recipe_steps')).toBe(recipeSeeds.reduce((n, s) => n + s.prep.length + s.cook.length, 0))
    const first = recipeSeeds[0]
    if (!first) throw new Error('seed がない')
    expect(db.prepare('SELECT source_type FROM recipes WHERE id = ?').get(recipeSeedId(first))).toEqual({
      source_type: 'seed',
    })
  })

  it('もう一度流しても重複しない', () => {
    const db = createTestD1().sqlite
    const sql = readFileSync(join(MIGRATIONS_DIR, '0002_seed_recipes.sql'), 'utf8')
    for (const stmt of sql.split('--> statement-breakpoint')) db.exec(stmt)
    expect(count(db, 'recipes')).toBe(recipeSeeds.length)
    expect(count(db, 'recipe_ingredients')).toBe(recipeSeeds.reduce((n, s) => n + s.ingredients.length, 0))
  })
})
