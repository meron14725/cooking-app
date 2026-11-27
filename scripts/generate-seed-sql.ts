// seed/ingredients.ts から食材マスタの初期データを入れるマイグレーション SQL を作る。
// 使い方: npm run seed:sql -- migrations/0001_seed_ingredients.sql
import { writeFileSync } from 'node:fs'
import { ingredientSeeds } from '../seed/ingredients'
import { normalizeDefaultUnit } from '../src/server/services/ingredients'
import { ingredientInputSchema } from '../src/shared/schemas/ingredient'
import { ulid } from '../src/shared/ulid'

const out = process.argv[2]
if (!out) throw new Error('出力先の SQL ファイルを指定してください')

const q = (v: string | number | boolean | null) => {
  if (v === null) return 'NULL'
  if (typeof v === 'boolean') return v ? '1' : '0'
  if (typeof v === 'number') return String(v)
  return `'${v.replaceAll("'", "''")}'`
}

const header = [
  '-- 食材マスタの初期データ（scripts/generate-seed-sql.ts で生成。値は目安なので画面で直す）',
  '-- 同じ名前の食材がすでにあれば何もしない',
].join('\n')
const lines: string[] = []

for (const seed of ingredientSeeds) {
  const v = ingredientInputSchema.parse(seed)
  lines.push(
    `INSERT INTO ingredients (id, name, aliases, category, unit, grams_per_unit, can_freeze, fridge_days, freezer_days, pantry_days, prepped_fridge_days, prepped_freezer_days, default_location, before_cook_task, frozen_cook_note, is_staple) VALUES (${[
      ulid(),
      v.name,
      JSON.stringify(v.aliases),
      v.category,
      v.unit,
      v.gramsPerUnit,
      v.canFreeze,
      v.fridgeDays,
      v.freezerDays,
      v.pantryDays,
      v.preppedFridgeDays,
      v.preppedFreezerDays,
      v.defaultLocation,
      v.beforeCookTask,
      v.frozenCookNote,
      v.isStaple,
    ]
      .map(q)
      .join(', ')}) ON CONFLICT (name) DO NOTHING;`,
  )
  for (const u of normalizeDefaultUnit(v.packageUnits)) {
    // 食材がすでにあった（上の INSERT が何もしなかった）ときは販売単位も足さない
    lines.push(
      `INSERT INTO package_units (id, ingredient_id, label, quantity, is_default) SELECT ${q(ulid())}, id, ${q(u.label)}, ${q(u.quantity)}, ${q(u.isDefault)} FROM ingredients WHERE name = ${q(v.name)} AND NOT EXISTS (SELECT 1 FROM package_units p WHERE p.ingredient_id = ingredients.id AND p.label = ${q(u.label)});`,
    )
  }
}

writeFileSync(out, `${header}\n${lines.join('\n--> statement-breakpoint\n')}\n`)
console.log(`${ingredientSeeds.length} 件を ${out} に書き出しました`)
