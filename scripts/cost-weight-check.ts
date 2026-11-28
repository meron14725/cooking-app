// 提案 v2 の金額の重み（RECOMMEND_WEIGHTS.cost）が効きすぎていないかを見る（docs/design/10-cost.md）。
// 料理を 1 つずつ食べたい料理にして提案を出し、重みを変えたときに、1 位の案と、追加される料理の材料費の偏りがどう変わるかを出す。
// 使い方:
//   npm run rec:cost                       # 架空のレシピ（価格はまとめて推定のあとの形）
//   npm run rec:cost -- --from-local-d1    # ローカルの D1（まとめて推定のあと）を使う
//   npm run rec:cost -- --weights 0,0.2,0.4 --target 8 --limit 40
import { DEFAULT_SERVINGS, DEFAULT_TARGET_MEALS, RECOMMEND_WEIGHTS } from '../src/shared/domain/constants'
import { costOfEvaluation } from '../src/shared/domain/cost'
import { todayJst } from '../src/shared/domain/date'
import { type AvailableStock, type RecRecipe, recommend, scoreUnitPrices } from '../src/shared/domain/recommend'
import { fixtureCatalog, pricedFixtureIngredients } from '../src/shared/domain/testing/catalog'
import { loadLocalD1 } from './localD1'

const argv = process.argv.slice(2)
const flag = (name: string) => argv.includes(name)
const option = (name: string) => {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}
const costWeights = (option('--weights') ?? '0,0.1,0.2,0.3,0.5').split(',').map(Number)
const target = Number(option('--target') ?? DEFAULT_TARGET_MEALS)
const limit = Number(option('--limit') ?? 60)

const source = flag('--from-local-d1')
  ? loadLocalD1()
  : { catalog: fixtureCatalog, ingredients: pricedFixtureIngredients(), available: [] as AvailableStock[] }
const { catalog, ingredients, available } = source
const today = todayJst()

// 料理そのものの 1 食あたりの材料費（点数と同じ単価。価格未設定は仮の単価）
const unitPrices = scoreUnitPrices(ingredients)
const recipeYen = new Map(
  catalog.map((r) => [
    r.id,
    r.ingredients.reduce((a, ri) => a + (ri.quantity ?? 0) * (unitPrices.get(ri.ingredientId) ?? 0), 0) / r.servings,
  ]),
)
const sortedYen = [...recipeYen.values()].sort((a, b) => a - b)
const cheapLine = sortedYen[Math.floor(sortedYen.length / 4)] ?? 0
const medianYen = sortedYen[Math.floor(sortedYen.length / 2)] ?? 0
const anchors = catalog.slice(0, limit)

console.log(
  `レシピ ${catalog.length} 件（食べたい料理にするのは ${anchors.length} 件）/ 合計 ${target} 食 / 1 回 3 案まで`,
)
console.log(
  `料理の 1 食あたりの材料費: 安いほうから 25% の線 ${cheapLine.toFixed(0)} 円、中央値 ${medianYen.toFixed(0)} 円`,
)
console.log(
  '\n| cost | 1 位の 1 食あたりの買う金額 | 1 位で足した料理の材料費 | 足した料理のうち安い 25% の料理 | 足した料理の種類 | 1 位が cost=0 と同じ | 点数の中の cost の割合 |',
)
console.log('|---|---|---|---|---|---|---|')

const keyOf = (p: { recipes: { recipeId: string; servings: number }[] }) =>
  p.recipes
    .map((r) => `${r.recipeId}:${r.servings}`)
    .sort()
    .join()
const baseline = new Map<string, string>()
for (const w of costWeights) {
  let buy = 0
  let firsts = 0
  let firstAddedYen = 0
  let firstAdded = 0
  let added = 0
  let cheap = 0
  let same = 0
  let costAbs = 0
  let allAbs = 0
  const kinds = new Set<string>()
  for (const anchor of anchors) {
    const res = recommend({
      anchors: [{ recipe: anchor as RecRecipe, servings: DEFAULT_SERVINGS }],
      catalog,
      available,
      ingredients,
      today,
      targetMeals: target,
      weights: { ...RECOMMEND_WEIGHTS, cost: w },
      options: { maxProposals: 3 },
    })
    res.proposals.forEach((p, i) => {
      for (const r of p.recipes.filter((x) => x.role === 'added')) {
        const yen = recipeYen.get(r.recipeId) ?? 0
        kinds.add(r.recipeId)
        added++
        if (yen <= cheapLine) cheap++
        if (i === 0) {
          firstAddedYen += yen
          firstAdded++
        }
      }
      for (const v of Object.values(p.scoreBreakdown ?? {})) allAbs += Math.abs(v)
      costAbs += Math.abs(p.scoreBreakdown?.cost ?? 0)
    })
    const first = res.proposals[0]
    if (!first) continue
    firsts++
    buy += costOfEvaluation(first, ingredients, target).buyYen / target
    if (w === costWeights[0]) baseline.set(anchor.id, keyOf(first))
    else if (baseline.get(anchor.id) === keyOf(first)) same++
  }
  const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '-')
  console.log(
    `| ${w} | 約 ${Math.round(buy / Math.max(firsts, 1))} 円 | 約 ${Math.round(firstAddedYen / Math.max(firstAdded, 1))} 円 | ${pct(cheap, added)} | ${kinds.size} | ${w === costWeights[0] ? '-' : `${same}/${firsts}`} | ${pct(costAbs, allAbs)} |`,
  )
}
console.log(`\n「1 位が cost=0 と同じ」は、いちばん左の重み（${costWeights[0]}）のときの 1 位と比べる`)
