// Node の SQLite（node:sqlite）で D1Database の必要な部分だけを真似る、テスト専用のアダプタ。
// Drizzle の D1 ドライバが使う prepare / bind / all / run / raw / first / batch に対応する。
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'

export const MIGRATIONS_DIR = join(import.meta.dirname, '../../../migrations')

type Params = SQLInputValue[]

/** D1 の 1 クエリあたりのバインド変数の上限 */
export const D1_MAX_BOUND_PARAMS = 100

function normalize(params: unknown[]): Params {
  return params.map((p) => {
    if (typeof p === 'boolean') return p ? 1 : 0
    if (p === undefined) return null
    return p as SQLInputValue
  })
}

class Statement {
  constructor(
    private readonly db: DatabaseSync,
    readonly query: string,
    readonly params: Params = [],
  ) {}

  bind(...params: unknown[]) {
    // 本物の D1 は 1 クエリのバインド変数が 100 を超えると「too many SQL variables」で失敗する
    if (params.length > D1_MAX_BOUND_PARAMS) {
      throw new Error(
        `D1_ERROR: too many SQL variables (${params.length} > ${D1_MAX_BOUND_PARAMS}): ${this.query.slice(0, 200)}`,
      )
    }
    return new Statement(this.db, this.query, normalize(params))
  }

  private stmt() {
    return this.db.prepare(this.query)
  }

  async all() {
    return this.allSync()
  }

  allSync() {
    const results = this.stmt().all(...this.params)
    return { results, success: true, meta: { changes: 0, last_row_id: 0, duration: 0 } }
  }

  async run() {
    const r = this.stmt().run(...this.params)
    return {
      results: [],
      success: true,
      meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid), duration: 0 },
    }
  }

  async raw() {
    const stmt = this.stmt()
    stmt.setReturnArrays(true)
    return stmt.all(...this.params)
  }

  async first(column?: string) {
    const row = this.stmt().get(...this.params) as Record<string, unknown> | undefined
    if (!row) return null
    return column ? row[column] : row
  }
}

/**
 * migrations/ をすべて当てた D1 を作る。
 * seed: false なら初期データのマイグレーション（ファイル名に _seed_ を含むもの）を飛ばす。
 */
export function createTestD1(opts: { seed?: boolean } = {}): D1Database & { sqlite: DatabaseSync } {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const file of readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .filter((f) => opts.seed !== false || !f.includes('_seed_'))
    .sort()) {
    for (const stmt of readFileSync(join(MIGRATIONS_DIR, file), 'utf8').split('--> statement-breakpoint')) {
      if (stmt.trim()) db.exec(stmt)
    }
  }

  const d1 = {
    sqlite: db,
    prepare: (query: string) => new Statement(db, query),
    batch: async (statements: Statement[]) => {
      // D1 の batch は 1 つのトランザクションとして動く
      db.exec('BEGIN')
      try {
        const results = statements.map((s) => s.allSync())
        db.exec('COMMIT')
        return results
      } catch (e) {
        db.exec('ROLLBACK')
        throw e
      }
    },
    exec: async (query: string) => {
      db.exec(query)
      return { count: 0, duration: 0 }
    },
  }
  return d1 as unknown as D1Database & { sqlite: DatabaseSync }
}
