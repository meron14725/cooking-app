import { describe, expect, it } from 'vitest'
import type { RecRecipe } from './recommend'
import { recipeFeatures, type ScoredItem, scoreProposal } from './recommendScore'
import { fixtureCatalog, fixtureIngredients } from './testing/catalog'

const features = recipeFeatures(fixtureCatalog, fixtureIngredients)
const item = (
  recipeId: string,
  servings: number,
  role: ScoredItem['role'] = 'added',
  wanted: number | null = null,
) => ({
  recipeId,
  servings,
  role,
  wantedServings: wanted,
})
const terms = (items: ScoredItem[]) => scoreProposal(items, { shopping: 0, buyYen: 0 }, features).breakdown

describe('recipeFeatures', () => {
  it('主な食材は肉・魚・大豆製品・卵を優先し、野菜は 1 食あたりの g', () => {
    const curry = features.get('curry')
    expect(curry?.mainIngredientId).toBe('pork')
    // 玉ねぎ 200 + にんじん 150 + じゃがいも 300 = 650g ÷ 2 人前
    expect(curry?.vegetableGrams).toBe(325)
    expect(features.get('spinachOhitashi')?.mainIngredientId).toBe('spinach')
  })

  it('人気はいちばん人気の料理を 1 とする', () => {
    const values = [...features.values()].map((f) => f.popularity)
    expect(Math.max(...values)).toBe(1)
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0)
  })

  it('調理時間がなければホットクックの設定から、それもなければ 30 分', () => {
    const r = (over: Partial<RecRecipe>): RecRecipe => ({
      id: 'x',
      title: 'x',
      servings: 2,
      caloriesKcal: null,
      maxServings1_6l: null,
      ingredients: [],
      ...over,
    })
    const f = (over: Partial<RecRecipe>) => recipeFeatures([r(over)], fixtureIngredients).get('x')
    expect(f({ hotcookMode: '手動 > 煮物を作る > まぜる > 25分' })?.minutes).toBe(35)
    expect(f({})?.minutes).toBe(30)
    expect(f({})?.potCap).toBe(4)
    expect(f({ maxServings1_6l: 3 })?.potCap).toBe(3)
  })
})

describe('scoreProposal の項目', () => {
  it('野菜が多い案のほうが良い', () => {
    expect(terms([item('mapo', 2, 'anchor'), item('spinachOhitashi', 2)]).vegetable).toBeLessThan(
      terms([item('mapo', 2, 'anchor'), item('sabaMiso', 2)]).vegetable,
    )
  })

  it('1 食あたりのカロリーが範囲から外れると減点', () => {
    // 副菜だけ（〜100kcal）は 450 を大きく下回る
    expect(terms([item('spinachOhitashi', 2), item('broccoliSteam', 2)]).calorie).toBeGreaterThan(0)
    expect(terms([item('curry', 2), item('stew', 2)]).calorie).toBe(0)
  })

  it('同じ料理を 2 食より多く食べると減点。ホットクックの回数は品数', () => {
    expect(terms([item('curry', 4)]).repeat).toBeGreaterThan(0)
    expect(terms([item('curry', 2)]).repeat).toBe(0)
    expect(terms([item('curry', 2), item('mapo', 2)]).hotcook).toBeCloseTo(0.2)
  })

  it('主菜が少ない、汁物ばかりだと減点', () => {
    expect(terms([item('misoSoup', 2), item('tonjiru', 2), item('spinachOhitashi', 2)]).typeBalance).toBeGreaterThan(0)
    expect(terms([item('nikujaga', 2), item('misoSoup', 2), item('spinachOhitashi', 2)]).typeBalance).toBe(0)
    // カレーなどご飯ものは主菜。カレー 4 食＋副菜 2 食は偏りなし
    expect(features.get('curry')?.dishType).toBe('main')
    expect(terms([item('curry', 4, 'anchor'), item('spinachOhitashi', 2)]).typeBalance).toBe(0)
  })

  it('案の中で主な食材が重なると減点', () => {
    expect(terms([item('chickenDaikon', 2), item('chickenTomato', 2)]).inPlanSimilarity).toBeGreaterThan(0)
    expect(terms([item('chickenDaikon', 2), item('mapo', 2)]).inPlanSimilarity).toBe(0)
  })

  it('食べたい料理の食数がずれると減点。人気の料理を足すと加点（マイナス）', () => {
    expect(terms([item('curry', 4, 'anchor', 2)]).wantDeviation).toBeGreaterThan(0)
    expect(terms([item('curry', 2, 'anchor', 2)]).wantDeviation).toBe(0)
    expect(terms([item('curry', 2, 'anchor'), item('nikujaga', 2)]).popularity).toBeLessThan(
      terms([item('curry', 2, 'anchor'), item('carrotKinpira', 2)]).popularity,
    )
  })

  it('内訳を足すと score', () => {
    const { score, breakdown } = scoreProposal(
      [item('curry', 4, 'anchor', 2), item('misoSoup', 2)],
      { shopping: 1.5, buyYen: 1200 },
      features,
    )
    expect(breakdown.shopping).toBe(1.5)
    // 0.2 × 1200 円 ÷ 6 食 ÷ 100 円
    expect(breakdown.cost).toBeCloseTo(0.4)
    expect(Object.values(breakdown).reduce((a, b) => a + b, 0)).toBeCloseTo(score, 2)
  })
})
