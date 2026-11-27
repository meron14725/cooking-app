/**
 * 提案 v2 の点数（docs/design/09-recommendation-v2.md「点数」）。DB に依存しない純粋関数。
 * 買い物・余り・在庫の点数（evaluate）に、カロリー・野菜・調理時間・ホットクックの回数・食べ続け・
 * 区分の偏り・案の中の重なり・食べたい料理の食数のずれ・人気を足す。小さいほど良い。
 */

import type { Cuisine, DishType } from '../schemas/recipe'
import {
  DEFAULT_COOK_MINUTES,
  KCAL_PER_MEAL,
  MAX_SERVINGS_PER_DISH,
  RECOMMEND_WEIGHTS,
  REPEAT_FREE_SERVINGS,
  type RecommendWeights,
  VEGETABLE_G_PER_MEAL,
} from './constants'
import { cookMinutesFromHotcookMode, toGrams } from './recipeAttributes'
import type { RecIngredient, RecRecipe } from './recommend'

/** 料理ごとの特徴（提案のたびに 1 回だけ計算して使い回す） */
export type RecipeFeatures = {
  /** 常備品を除いた材料のうち、肉・魚・大豆製品・卵で g 換算がいちばん多いもの（なければ g 換算がいちばん多いもの） */
  mainIngredientId: string | null
  /** 1 食あたりの野菜（g） */
  vegetableGrams: number
  /** 1 人前のカロリー */
  kcal: number | null
  /** 調理時間の目安（分） */
  minutes: number
  /** 人気（候補の中の最大で割って 0〜1） */
  popularity: number
  dishType: DishType | null
  cuisine: Cuisine | null
  /** 1 回で作れる食数（1.6L の上限と MAX_SERVINGS_PER_DISH の小さいほう） */
  potCap: number
}

const PROTEIN = new Set(['meat', 'fish', 'tofu_egg_dairy'])

function rawPopularity(r: RecRecipe): number {
  const favorites = (r.favoriteCount ?? 0) + (r.isFavorite ? 1 : 0)
  return Math.log1p(favorites) + 0.5 * Math.log1p(r.cookCount ?? 0)
}

/** 料理ごとの特徴をまとめて出す。人気は渡した料理の中の最大で割る */
export function recipeFeatures(
  list: RecRecipe[],
  ingredients: Map<string, RecIngredient>,
): Map<string, RecipeFeatures> {
  const maxPopularity = Math.max(0, ...list.map(rawPopularity))
  const result = new Map<string, RecipeFeatures>()
  for (const r of list) {
    let vegetable = 0
    let best: { id: string; grams: number; protein: boolean } | null = null
    for (const ri of r.ingredients) {
      const ing = ingredients.get(ri.ingredientId)
      if (!ing || ing.isStaple) continue
      const grams = toGrams(ri.quantity, ing.unit, ing.gramsPerUnit ?? null)
      if (grams === null) continue
      if (ing.category === 'vegetable') vegetable += grams
      const protein = PROTEIN.has(ing.category ?? '')
      if (!best || (protein && !best.protein) || (protein === best.protein && grams > best.grams)) {
        best = { id: ing.id, grams, protein }
      }
    }
    result.set(r.id, {
      mainIngredientId: best?.id ?? null,
      vegetableGrams: vegetable / r.servings,
      kcal: r.caloriesKcal,
      minutes: r.cookMinutes ?? cookMinutesFromHotcookMode(r.hotcookMode ?? null) ?? DEFAULT_COOK_MINUTES,
      popularity: maxPopularity > 0 ? rawPopularity(r) / maxPopularity : 0,
      dishType: r.dishType ?? null,
      cuisine: r.cuisine ?? null,
      potCap: Math.min(MAX_SERVINGS_PER_DISH, r.maxServings1_6l ?? MAX_SERVINGS_PER_DISH),
    })
  }
  return result
}

export const SCORE_TERMS = [
  'shopping',
  'calorie',
  'vegetable',
  'time',
  'hotcook',
  'repeat',
  'typeBalance',
  'inPlanSimilarity',
  'wantDeviation',
  'popularity',
] as const
export type ScoreTerm = (typeof SCORE_TERMS)[number]
/** 項目ごとの点数（重みを掛けた後）。足すと score になる */
export type ScoreBreakdown = Record<ScoreTerm, number>

export type ScoredItem = {
  recipeId: string
  servings: number
  role: 'anchor' | 'added'
  /** 食べたい料理の、選んだときの食数（固定した料理・追加料理は null） */
  wantedServings: number | null
}

const round = (n: number) => Math.round(n * 1000) / 1000

/** 1 案の点数と内訳。shopping は evaluate() の点数 */
export function scoreProposal(
  items: ScoredItem[],
  shopping: number,
  features: Map<string, RecipeFeatures>,
  weights: RecommendWeights = RECOMMEND_WEIGHTS,
): { score: number; breakdown: ScoreBreakdown } {
  const total = items.reduce((a, i) => a + i.servings, 0)
  const feats = items.map((i) => ({ item: i, f: features.get(i.recipeId) as RecipeFeatures }))

  // カロリー: 分かる料理だけで 1 食あたりを出す
  const known = feats.filter((x) => x.f.kcal !== null)
  const knownMeals = known.reduce((a, x) => a + x.item.servings, 0)
  let calorie = 0
  if (knownMeals > 0) {
    const perMeal = known.reduce((a, x) => a + (x.f.kcal ?? 0) * x.item.servings, 0) / knownMeals
    calorie = Math.max(0, KCAL_PER_MEAL.min - perMeal, perMeal - KCAL_PER_MEAL.max) / 100
  }

  const vegetablePerMeal = total > 0 ? feats.reduce((a, x) => a + x.f.vegetableGrams * x.item.servings, 0) / total : 0
  const vegetable = Math.max(0, VEGETABLE_G_PER_MEAL - vegetablePerMeal) / 50
  const time = feats.reduce((a, x) => a + x.f.minutes, 0) / 60
  const hotcook = feats.reduce((a, x) => a + Math.ceil(x.item.servings / Math.max(x.f.potCap, 1) - 1e-9), 0)
  const repeat = items.reduce((a, i) => a + Math.max(0, i.servings - REPEAT_FREE_SERVINGS), 0)

  // 区分の偏り（未判定の料理は数えない）
  let typeBalance = 0
  const typed = feats.filter((x) => x.f.dishType !== null)
  const typedMeals = typed.reduce((a, x) => a + x.item.servings, 0)
  if (typedMeals > 0) {
    const meals = (t: string[]) =>
      typed.filter((x) => t.includes(x.f.dishType as string)).reduce((a, x) => a + x.item.servings, 0)
    if (meals(['main']) < typedMeals / 3) typeBalance += 1
    if (meals(['soup', 'other']) > typedMeals / 2) typeBalance += 1
  }

  // 案の中の重なり: 同じ主な食材の 2 品目以降 1 品ごとに 1、同じ系統が 3 品以上なら 1
  let inPlanSimilarity = 0
  const countBy = (key: (x: (typeof feats)[number]) => string | null) => {
    const m = new Map<string, number>()
    for (const x of feats) {
      const k = key(x)
      if (k !== null) m.set(k, (m.get(k) ?? 0) + 1)
    }
    return [...m.values()]
  }
  for (const n of countBy((x) => x.f.mainIngredientId)) inPlanSimilarity += Math.max(0, n - 1)
  for (const n of countBy((x) => x.f.cuisine)) if (n >= 3) inPlanSimilarity += 1

  const wantDeviation = items.reduce(
    (a, i) => a + (i.wantedServings === null ? 0 : Math.abs(i.servings - i.wantedServings)),
    0,
  )

  const added = feats.filter((x) => x.item.role === 'added')
  const addedMeals = added.reduce((a, x) => a + x.item.servings, 0)
  const popularity = addedMeals > 0 ? added.reduce((a, x) => a + x.f.popularity * x.item.servings, 0) / addedMeals : 0

  const breakdown: ScoreBreakdown = {
    shopping: round(shopping),
    calorie: round(weights.calorie * calorie),
    vegetable: round(weights.vegetable * vegetable),
    time: round(weights.time * time),
    hotcook: round(weights.hotcook * hotcook),
    repeat: round(weights.repeat * repeat),
    typeBalance: round(weights.typeBalance * typeBalance),
    inPlanSimilarity: round(weights.inPlanSimilarity * inPlanSimilarity),
    wantDeviation: round(weights.wantDeviation * wantDeviation),
    popularity: round(-weights.popularity * popularity),
  }
  const score = round(SCORE_TERMS.reduce((a, k) => a + breakdown[k], 0))
  return { score, breakdown }
}
