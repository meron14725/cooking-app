// 提案 v2 の重みを変えて結果を見る（docs/design/09-recommendation-v2.md「重みの調整」）。
// 使い方:
//   npm run rec:try -- --anchor curry
//   npm run rec:try -- --anchor curry --anchor mapo:4 --target 8 --weights vegetable=0.6,popularity=0
//   npm run rec:try -- --synthetic 600 --anchor syn0      # 件数を増やして計算量を見る
//   npm run rec:try -- --anchor curry --lambda 0           # 多様性を切って点数順そのままにする
//   npm run rec:try -- --synthetic 600 --anchor syn0 --step 1 --target 8 --rounds 15
//                                                          # 「別の案を出す」を続けて押し、1 回ごとの時間と評価回数（最悪のとき）を見る
//   npm run rec:try -- --from-local-d1 --anchor <レシピID>  # ローカルの D1（wrangler dev の .wrangler/state）を使う
//   npm run rec:try -- --priced --anchor curry --weights cost=0.1  # 架空の食材に価格を入れて（まとめて推定のあとの形）見る
// 既定は架空のレシピ（src/shared/domain/testing/catalog.ts）。在庫は --from-local-d1 のときだけ、確保分を引かずに使う
import { DEFAULT_SERVINGS, DEFAULT_TARGET_MEALS, RECOMMEND_WEIGHTS } from '../src/shared/domain/constants'
import { costOfEvaluation } from '../src/shared/domain/cost'
import { todayJst } from '../src/shared/domain/date'
import { type AvailableStock, recommend } from '../src/shared/domain/recommend'
import {
  fixtureCatalog,
  fixtureIngredients,
  pricedFixtureIngredients,
  syntheticCatalog,
} from '../src/shared/domain/testing/catalog'
import { loadLocalD1 } from './localD1'

type Args = {
  anchors: { id: string; servings: number }[]
  target: number
  weights: Partial<typeof RECOMMEND_WEIGHTS>
  synthetic: number | null
  fromLocalD1: boolean
  priced: boolean
  proposals: number
  lambda: number | undefined
  rounds: number
  step: number | undefined
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    anchors: [],
    target: DEFAULT_TARGET_MEALS,
    weights: {},
    synthetic: null,
    fromLocalD1: false,
    priced: false,
    proposals: 3,
    lambda: undefined,
    rounds: 0,
    step: undefined,
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
    else if (key === '--rounds') args.rounds = Number(value())
    else if (key === '--step') args.step = Number(value())
    else if (key === '--synthetic') args.synthetic = Number(value())
    else if (key === '--from-local-d1') args.fromLocalD1 = true
    else if (key === '--priced') args.priced = true
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

// ---------- 実行 ----------

const args = parseArgs(process.argv.slice(2))
const source = args.fromLocalD1
  ? loadLocalD1()
  : {
      catalog: args.synthetic ? [...fixtureCatalog, ...syntheticCatalog(args.synthetic)] : fixtureCatalog,
      ingredients: args.priced ? pricedFixtureIngredients() : fixtureIngredients,
      available: [] as AvailableStock[],
    }
const byId = new Map(source.catalog.map((r) => [r.id, r]))
const anchors = args.anchors.map((a) => {
  const recipe = byId.get(a.id)
  if (!recipe) throw new Error(`レシピが見つかりません: ${a.id}`)
  return { recipe, servings: a.servings }
})

const weights = { ...RECOMMEND_WEIGHTS, ...args.weights }
const run = (w: typeof RECOMMEND_WEIGHTS, exclude: { recipeId: string; servings: number }[][] = []) =>
  recommend({
    anchors,
    catalog: source.catalog,
    available: source.available,
    ingredients: source.ingredients,
    today: todayJst(),
    targetMeals: args.target,
    weights: w,
    exclude,
    options: { maxProposals: args.proposals, diversityLambda: args.lambda, servingsStep: args.step },
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
  const cost = costOfEvaluation(p, source.ingredients, args.target)
  const unpriced = cost.hasUnpriced ? `（${cost.unpricedCount} 品未設定）` : ''
  console.log(`  金額: 買う分 約 ${cost.buyYen} 円 / 1 食あたり 約 ${cost.perMealYen} 円${unpriced}`)
  const leftovers = p.leftovers.filter((l) => l.perishable).map((l) => `${l.name} ${l.packs.toFixed(2)}パック`)
  if (leftovers.length > 0) console.log(`  余り（冷蔵のみ）: ${leftovers.join('、')}`)
  const terms = Object.entries(p.scoreBreakdown ?? {})
    .filter(([, v]) => v !== 0)
    .map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`)
  console.log(`  内訳: ${terms.join(' / ')}`)
})
if (result.proposals.length === 0) console.log('\n案がありません')

if (args.rounds > 0) {
  // 「別の案を出す」を続けて押す
  const exclude: { recipeId: string; servings: number }[][] = []
  let worst = { ms: 0, evaluations: 0 }
  console.log(`\n別の案を ${args.rounds} 回まで続けて押す`)
  for (let i = 1; i <= args.rounds; i++) {
    const t = performance.now()
    const r = run(weights, exclude)
    const took = performance.now() - t
    worst = { ms: Math.max(worst.ms, took), evaluations: Math.max(worst.evaluations, r.evaluations ?? 0) }
    console.log(
      `  ${i} 回目: ${took.toFixed(0)} ms / 評価 ${r.evaluations ?? 0} 回 / ${r.proposals.length} 案 / hasMore ${r.hasMore}`,
    )
    for (const p of r.proposals) exclude.push(p.recipes.map((x) => ({ recipeId: x.recipeId, servings: x.servings })))
    if (!r.hasMore) break
  }
  console.log(`  最悪: ${worst.ms.toFixed(0)} ms / 評価 ${worst.evaluations} 回`)
}
