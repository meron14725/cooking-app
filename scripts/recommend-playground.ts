// 提案 v2 の重みを変えて結果を見る（docs/design/09-recommendation-v2.md「重みの調整」）。
// 使い方:
//   npm run rec:try -- --anchor curry
//   npm run rec:try -- --anchor curry --anchor mapo:4 --target 8 --weights vegetable=0.6,popularity=0
//   npm run rec:try -- --synthetic 600 --anchor syn0      # 件数を増やして計算量を見る
//   npm run rec:try -- --anchor curry --lambda 0           # 多様性を切って点数順そのままにする
//   npm run rec:try -- --from-local-d1 --anchor <レシピID>  # ローカルの D1（wrangler dev の .wrangler/state）を使う
// 既定は架空のレシピ（src/shared/domain/testing/catalog.ts）。在庫は --from-local-d1 のときだけ、確保分を引かずに使う
import { spawnSync } from 'node:child_process'
import { DEFAULT_SERVINGS, DEFAULT_TARGET_MEALS, RECOMMEND_WEIGHTS } from '../src/shared/domain/constants'
import { todayJst } from '../src/shared/domain/date'
import { type AvailableStock, type RecIngredient, type RecRecipe, recommend } from '../src/shared/domain/recommend'
import { fixtureCatalog, fixtureIngredients, syntheticCatalog } from '../src/shared/domain/testing/catalog'
import type { Cuisine, DishType } from '../src/shared/schemas/recipe'

type Args = {
  anchors: { id: string; servings: number }[]
  target: number
  weights: Partial<typeof RECOMMEND_WEIGHTS>
  synthetic: number | null
  fromLocalD1: boolean
  proposals: number
  lambda: number | undefined
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    anchors: [],
    target: DEFAULT_TARGET_MEALS,
    weights: {},
    synthetic: null,
    fromLocalD1: false,
    proposals: 3,
    lambda: undefined,
  }
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    const value = () => {
      const v = argv[++i]
      if (v === undefined) throw new Error(`${key} の値がありません`)
      return v
    }
    if (key === '--anchor') {
      const [id, servings] = value().split(':')
      args.anchors.push({ id: id ?? '', servings: servings ? Number(servings) : DEFAULT_SERVINGS })
    } else if (key === '--target') args.target = Number(value())
    else if (key === '--proposals') args.proposals = Number(value())
    else if (key === '--lambda') args.lambda = Number(value())
    else if (key === '--synthetic') args.synthetic = Number(value())
    else if (key === '--from-local-d1') args.fromLocalD1 = true
    else if (key === '--weights') {
      for (const pair of value().split(',')) {
        const [k, v] = pair.split('=')
        if (!k || !(k in RECOMMEND_WEIGHTS)) {
          throw new Error(`重みの名前が違います: ${k}（${Object.keys(RECOMMEND_WEIGHTS).join(', ')}）`)
        }
        args.weights[k as keyof typeof RECOMMEND_WEIGHTS] = Number(v)
      }
    } else throw new Error(`知らない引数です: ${key}`)
  }
  if (args.anchors.length === 0) throw new Error('--anchor <レシピID>[:食数] を 1 つ以上指定してください')
  return args
}

// ---------- ローカルの D1 から読む ----------

function query<T>(sql: string): T[] {
  const res = spawnSync('npx', ['wrangler', 'd1', 'execute', 'cooking-app', '--local', '--json', '--command', sql], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  })
  if (res.status !== 0) throw new Error(`wrangler d1 execute に失敗しました:\n${res.stderr}`)
  const parsed = JSON.parse(res.stdout) as { results: T[] }[]
  return parsed[0]?.results ?? []
}

type Row = Record<string, string | number | null>

function loadLocalD1(): { catalog: RecRecipe[]; ingredients: Map<string, RecIngredient>; available: AvailableStock[] } {
  const ingRows = query<Row>(
    'SELECT id, name, unit, category, grams_per_unit, is_staple, can_freeze, pantry_days, prepped_fridge_days, price_yen FROM ingredients',
  )
  const units = query<Row>(
    'SELECT id, ingredient_id, label, quantity, is_default FROM package_units ORDER BY created_at, id',
  )
  const recipeRows = query<Row>(
    'SELECT id, title, servings, calories_kcal, max_servings_1_6l, hotcook_mode, dish_type, cuisine, cook_minutes, favorite_count, is_favorite, cook_count FROM recipes WHERE archived_at IS NULL',
  )
  const parts = query<Row>(
    'SELECT recipe_id, ingredient_id, quantity FROM recipe_ingredients ORDER BY recipe_id, sort_order',
  )
  const stock = query<Row>(
    'SELECT id, ingredient_id, quantity, expires_on FROM inventory_items WHERE used_up_at IS NULL AND quantity > 0',
  )
  const num = (v: Row[string] | undefined) => (v === null || v === undefined ? null : Number(v))
  const ingredients = new Map<string, RecIngredient>(
    ingRows.map((r) => [
      String(r.id),
      {
        id: String(r.id),
        name: String(r.name),
        unit: String(r.unit),
        category: String(r.category),
        gramsPerUnit: num(r.grams_per_unit),
        isStaple: r.is_staple === 1,
        canFreeze: r.can_freeze === 1,
        pantryDays: num(r.pantry_days),
        preppedFridgeDays: num(r.prepped_fridge_days),
        priceYen: num(r.price_yen),
        packageUnits: units
          .filter((u) => u.ingredient_id === r.id)
          .map((u) => ({
            id: String(u.id),
            label: String(u.label),
            quantity: Number(u.quantity),
            isDefault: u.is_default === 1,
          })),
      },
    ]),
  )
  const catalog: RecRecipe[] = recipeRows.map((r) => ({
    id: String(r.id),
    title: String(r.title),
    servings: Number(r.servings),
    caloriesKcal: num(r.calories_kcal),
    maxServings1_6l: num(r.max_servings_1_6l),
    hotcookMode: r.hotcook_mode === null ? null : String(r.hotcook_mode),
    dishType: (r.dish_type as DishType | null) ?? null,
    cuisine: (r.cuisine as Cuisine | null) ?? null,
    cookMinutes: num(r.cook_minutes),
    favoriteCount: num(r.favorite_count),
    isFavorite: r.is_favorite === 1,
    cookCount: num(r.cook_count),
    ingredients: parts
      .filter((p) => p.recipe_id === r.id)
      .map((p) => ({ ingredientId: String(p.ingredient_id), quantity: num(p.quantity) })),
  }))
  const available = stock.map((s) => ({
    inventoryItemId: String(s.id),
    ingredientId: String(s.ingredient_id),
    quantity: Number(s.quantity),
    expiresOn: String(s.expires_on),
  }))
  return { catalog, ingredients, available }
}

// ---------- 実行 ----------

const args = parseArgs(process.argv.slice(2))
const source = args.fromLocalD1
  ? loadLocalD1()
  : {
      catalog: args.synthetic ? [...fixtureCatalog, ...syntheticCatalog(args.synthetic)] : fixtureCatalog,
      ingredients: fixtureIngredients,
      available: [] as AvailableStock[],
    }
const byId = new Map(source.catalog.map((r) => [r.id, r]))
const anchors = args.anchors.map((a) => {
  const recipe = byId.get(a.id)
  if (!recipe) throw new Error(`レシピが見つかりません: ${a.id}`)
  return { recipe, servings: a.servings }
})

const weights = { ...RECOMMEND_WEIGHTS, ...args.weights }
const run = (w: typeof RECOMMEND_WEIGHTS) =>
  recommend({
    anchors,
    catalog: source.catalog,
    available: source.available,
    ingredients: source.ingredients,
    today: todayJst(),
    targetMeals: args.target,
    weights: w,
    options: { maxProposals: args.proposals, diversityLambda: args.lambda },
  })
const started = performance.now()
const result = run(weights)
const ms = performance.now() - started
// 重みを変えたときは、既定の重みで何番目の案だったかも出す
const changed = Object.keys(args.weights).length > 0
const keyOf = (p: (typeof result.proposals)[number]) =>
  p.recipes
    .map((r) => `${r.recipeId}:${r.servings}`)
    .sort()
    .join()
const defaultRank = changed ? new Map(run(RECOMMEND_WEIGHTS).proposals.map((p, i) => [keyOf(p), i + 1])) : null

console.log(
  `レシピ ${source.catalog.length} 件 / 合計 ${args.target} 食 / ${ms.toFixed(0)} ms / 評価 ${result.evaluations ?? 0} 回`,
)
console.log(
  `重み: ${Object.entries(weights)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ')}`,
)
result.proposals.forEach((p, i) => {
  const rank = defaultRank
    ? `  既定の重みでは ${defaultRank.get(keyOf(p)) ?? `${args.proposals} 位より下`}${defaultRank.has(keyOf(p)) ? ' 位' : ''}`
    : ''
  console.log(`\n案 ${i + 1}  点数 ${p.score.toFixed(3)}（小さいほど良い）${rank}`)
  for (const r of p.recipes) {
    const recipe = byId.get(r.recipeId)
    const tag = r.role === 'anchor' ? '食べたい' : '追加'
    console.log(
      `  ${r.dayIndex}日目 ${recipe?.title ?? r.recipeId} ${r.servings}食（${tag}・${recipe?.dishType ?? '区分なし'}）`,
    )
  }
  const shopping = p.shopping.map((s) => `${s.name} ${s.packageLabel ?? ''}×${s.packageCount}`).join('、')
  console.log(`  買い物: ${shopping || 'なし'}`)
  const leftovers = p.leftovers.filter((l) => l.perishable).map((l) => `${l.name} ${l.packs.toFixed(2)}パック`)
  if (leftovers.length > 0) console.log(`  余り（冷蔵のみ）: ${leftovers.join('、')}`)
  const terms = Object.entries(p.scoreBreakdown ?? {})
    .filter(([, v]) => v !== 0)
    .map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`)
  console.log(`  内訳: ${terms.join(' / ')}`)
})
if (result.proposals.length === 0) console.log('\n案がありません')
