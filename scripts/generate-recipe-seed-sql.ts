// seed/recipes.ts から基本レシピの初期データを入れるマイグレーション SQL を作る。
// 使い方: npm run seed:recipes-sql -- migrations/0002_seed_recipes.sql
import { writeFileSync } from 'node:fs'
import { recipeSeedId, recipeSeedToInput } from '../seed/recipe-input'
import { recipeSeeds } from '../seed/recipes'

const out = process.argv[2]
if (!out) throw new Error('出力先の SQL ファイルを指定してください')

const q = (v: string | number | boolean | null | undefined) => {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'boolean') return v ? '1' : '0'
  if (typeof v === 'number') return String(v)
  return `'${v.replaceAll("'", "''")}'`
}

const header = [
  '-- 基本レシピの初期データ（scripts/generate-recipe-seed-sql.ts で生成。設定やカロリーは目安なので画面で直す）',
  '-- id は固定。すでにあれば何もしない（削除済みのものも戻さない）',
].join('\n')
const lines: string[] = []

for (const seed of recipeSeeds) {
  const id = recipeSeedId(seed)
  // 食材 id はマイグレーション時に名前から引くので、ここでは名前を入れておく
  const v = recipeSeedToInput(seed, (name) => name)
  lines.push(
    `INSERT INTO recipes (id, title, servings, calories_kcal, calories_estimated, hotcook_mode, max_servings_1_6l, pack_seasonings, source_type, source_url, notes) VALUES (${[
      id,
      v.title,
      v.servings,
      v.caloriesKcal,
      v.caloriesEstimated,
      v.hotcookMode,
      v.maxServings1_6l,
      v.packSeasonings,
      v.sourceType,
      v.sourceUrl,
      v.notes,
    ]
      .map(q)
      .join(', ')}) ON CONFLICT (id) DO NOTHING;`,
  )
  v.ingredients.forEach((ing, index) => {
    // 食材が見つからなければ行は入らない（テストで全件そろうことを確かめる）
    lines.push(
      `INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, display_text, cut_style, add_order, sort_order) SELECT ${[
        `${id}-i${index + 1}`,
        id,
      ]
        .map(q)
        .join(
          ', ',
        )}, ingredients.id, ${[ing.quantity, ing.displayText, ing.cutStyle, ing.addOrder, index].map(q).join(', ')} FROM ingredients WHERE ingredients.name = ${q(ing.ingredientId)} ON CONFLICT (id) DO NOTHING;`,
    )
  })
  v.steps.forEach((step, index) => {
    lines.push(
      `INSERT INTO recipe_steps (id, recipe_id, step_no, phase, text) VALUES (${[
        `${id}-s${index + 1}`,
        id,
        index + 1,
        step.phase,
        step.text,
      ]
        .map(q)
        .join(', ')}) ON CONFLICT (id) DO NOTHING;`,
    )
  })
}

writeFileSync(out, `${header}\n${lines.join('\n--> statement-breakpoint\n')}\n`)
console.log(`${recipeSeeds.length} 件を ${out} に書き出しました`)
