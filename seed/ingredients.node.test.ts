import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createTestD1, MIGRATIONS_DIR } from '../src/server/testing/d1'
import { ingredientInputSchema } from '../src/shared/schemas/ingredient'
import { ingredientSeeds } from './ingredients'

describe('食材マスタの初期データ', () => {
  it('50 件以上あり、すべて入力の検証を通る', () => {
    expect(ingredientSeeds.length).toBeGreaterThanOrEqual(50)
    for (const seed of ingredientSeeds) {
      const result = ingredientInputSchema.safeParse(seed)
      expect(result.success, `${seed.name}: ${JSON.stringify(result.error?.issues)}`).toBe(true)
    }
  })

  it('名前と別名が重複しない', () => {
    const names = ingredientSeeds.flatMap((s) => [s.name, ...(s.aliases ?? [])])
    const dup = names.filter((n, i) => names.indexOf(n) !== i)
    expect(dup).toEqual([])
  })

  it('マイグレーションで全件入り、代表の販売単位は食材ごとに 1 つまで', () => {
    const db = createTestD1().sqlite
    expect(db.prepare('SELECT count(*) AS n FROM ingredients').get()).toEqual({ n: ingredientSeeds.length })
    const dup = db
      .prepare(
        'SELECT ingredient_id FROM package_units WHERE is_default = 1 GROUP BY ingredient_id HAVING count(*) > 1',
      )
      .all()
    expect(dup).toEqual([])
  })

  it('もう一度流しても重複しない（同じ名前はスキップ）', () => {
    const db = createTestD1().sqlite
    const sql = readFileSync(join(MIGRATIONS_DIR, '0001_seed_ingredients.sql'), 'utf8')
    for (const stmt of sql.split('--> statement-breakpoint')) db.exec(stmt)
    expect(db.prepare('SELECT count(*) AS n FROM ingredients').get()).toEqual({ n: ingredientSeeds.length })
    const units = ingredientSeeds.reduce((n, s) => n + (s.packageUnits?.length ?? 0), 0)
    expect(db.prepare('SELECT count(*) AS n FROM package_units').get()).toEqual({ n: units })
  })

  it('生成済みの SQL が seed/ingredients.ts と食い違っていない（名前の一覧で比較）', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, '0001_seed_ingredients.sql'), 'utf8')
    const namesInSql = [...sql.matchAll(/INSERT INTO ingredients .*? VALUES \('[^']+', '([^']+)'/g)].map((m) => m[1])
    expect(namesInSql).toEqual(ingredientSeeds.map((s) => s.name))
  })
})
