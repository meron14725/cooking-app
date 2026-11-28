// 食材の日持ち・参考価格の CSV（docs/data/README.md）
//   npm run research -- template --export ingredients.json [--category 野菜]   調べる前の CSV を標準出力に出す
//   npm run research -- check docs/data/ingredients/*.csv [--export ingredients.json]   値を確かめる（エラーがあれば終了コード 1）
//   npm run research -- sql --export ingredients.json --out research.sql [--source-urls] docs/data/ingredients/*.csv
import { readFileSync, writeFileSync } from 'node:fs'
import { CATEGORY_OPTIONS, categoryLabel } from '../../src/shared/schemas/ingredient'
import {
  buildSql,
  type CsvRow,
  checkRows,
  defaultPriceUnit,
  type ExportedIngredient,
  parseExport,
  readResearchCsv,
  writeCsv,
} from './research'

const [command, ...rest] = process.argv.slice(2)
const options = new Map<string, string | true>()
const files: string[] = []
for (let i = 0; i < rest.length; i++) {
  const a = rest[i] as string
  if (a.startsWith('--')) {
    const next = rest[i + 1]
    if (next !== undefined && !next.startsWith('--') && a !== '--source-urls') {
      options.set(a, next)
      i++
    } else options.set(a, true)
  } else files.push(a)
}
const option = (name: string) => {
  const v = options.get(name)
  return typeof v === 'string' ? v : undefined
}

const loadExport = (): ExportedIngredient[] | undefined => {
  const path = option('--export')
  return path ? parseExport(JSON.parse(readFileSync(path, 'utf8'))) : undefined
}
const loadCsv = (): CsvRow[] => files.flatMap((f) => readResearchCsv(readFileSync(f, 'utf8')))

function template() {
  const exported = loadExport()
  if (!exported) throw new Error('--export が要ります')
  const category = option('--category')
  if (category && !CATEGORY_OPTIONS.some((o) => o.label === category)) {
    throw new Error(`分類は ${CATEGORY_OPTIONS.map((o) => o.label).join(' / ')}`)
  }
  const rows = exported
    .filter((e) => !category || categoryLabel(e.category) === category)
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
    .map(
      (e): CsvRow => ({
        id: e.id,
        名前: e.name,
        分類: categoryLabel(e.category),
        冷蔵日数: '',
        冷凍可否: '',
        冷凍日数: '',
        常温日数: '',
        保存場所: '',
        価格: '',
        価格の単位: defaultPriceUnit(e),
        出典URL: '',
        メモ: '',
      }),
    )
  process.stdout.write(writeCsv(rows))
}

function check() {
  const rows = loadCsv()
  const result = checkRows(rows, loadExport())
  const errors = result.issues.filter((i) => i.level === 'error')
  const warns = result.issues.filter((i) => i.level === 'warn')
  console.log(`行: ${result.rows} / 日持ちを反映: ${result.storageRows} / 価格を反映: ${result.priceRows}`)
  console.log(`エラー: ${errors.length} / 警告: ${warns.length}`)
  for (const i of [...errors, ...warns]) console.log(`- [${i.level}] ${i.name}（${i.id}）: ${i.message}`)
  if (errors.length > 0) process.exitCode = 1
}

function sql() {
  const exported = loadExport()
  const out = option('--out')
  if (!exported || !out) throw new Error('--export と --out が要ります')
  const statements = buildSql(loadCsv(), exported, {
    now: new Date().toISOString(),
    sourceUrls: options.has('--source-urls'),
  })
  writeFileSync(out, `${statements.join('\n')}\n`)
  console.log(`${statements.length} 文を ${out} に書きました`)
}

const commands: Record<string, () => void> = { template, check, sql }
const run = command ? commands[command] : undefined
if (!run) {
  console.error('使い方: npm run research -- template | check | sql（scripts/research/cli.ts の先頭を参照）')
  process.exit(2)
}
run()
