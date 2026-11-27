import { describe, expect, it } from 'vitest'
import { MAX_EVALUATIONS, RECOMMEND_WEIGHTS } from './constants'
import { allocations, allowedServings, type RecommendInput, type RecRecipe, recommend } from './recommend'
import { recipeFeatures } from './recommendScore'
import { fixtureCatalog, fixtureIngredients, syntheticCatalog } from './testing/catalog'

const today = '2026-11-27'
const byId = new Map(fixtureCatalog.map((r) => [r.id, r]))
const get = (id: string) => byId.get(id) as RecRecipe

function run(over: Partial<RecommendInput> & { anchors: RecommendInput['anchors'] }) {
  return recommend({
    catalog: fixtureCatalog,
    available: [],
    ingredients: fixtureIngredients,
    today,
    targetMeals: 6,
    ...over,
  })
}

const shape = (p: { recipes: { servings: number }[] }) =>
  p.recipes
    .map((r) => r.servings)
    .sort((a, b) => b - a)
    .join(',')

describe('allowedServings / allocations', () => {
  const f = (potCap: number) => ({ potCap }) as Parameters<typeof allowedServings>[0]
  it('刻みの倍数で、作れる量まで。刻みより少ししか作れなければその量だけ', () => {
    expect(allowedServings(f(4), 2)).toEqual([2, 4])
    expect(allowedServings(f(3), 2)).toEqual([2])
    expect(allowedServings(f(1), 2)).toEqual([1])
    expect(allowedServings(f(4), 1)).toEqual([1, 2, 3, 4])
  })

  it('合計がぴったりになる配り方を全部出す', () => {
    expect([
      ...allocations(
        [
          [2, 4],
          [2, 4],
        ],
        6,
      ),
    ]).toEqual([
      [2, 4],
      [4, 2],
    ])
    expect([
      ...allocations(
        [
          [2, 4],
          [2, 4],
          [2, 4],
        ],
        6,
      ),
    ]).toEqual([[2, 2, 2]])
    expect([...allocations([[2, 4]], 8)]).toEqual([])
    expect([...allocations([], 0)]).toEqual([[]])
  })
})

describe('recommend（合計◯食）', () => {
  it('どの案も食数の合計が目標と同じで、1 品は刻みの倍数・4 食まで', () => {
    for (const targetMeals of [4, 6, 8]) {
      const r = run({ anchors: [{ recipe: get('curry'), servings: 2 }], targetMeals })
      expect(r.proposals.length).toBeGreaterThan(0)
      for (const p of r.proposals) {
        expect(p.recipes.reduce((a, x) => a + x.servings, 0)).toBe(targetMeals)
        for (const x of p.recipes) {
          expect(x.servings % 2).toBe(0)
          expect(x.servings).toBeLessThanOrEqual(4)
        }
        expect(p.recipes.length).toBeLessThanOrEqual(4)
      }
    }
  })

  it('食数の配り方の違う案が並ぶ（カレー 4 ＋副菜 2 と、カレー 2 ＋ 2 品を 2 食ずつ）', () => {
    const catalog = [get('curry'), get('spinachOhitashi'), get('broccoliSteam')]
    const r = run({ anchors: [{ recipe: get('curry'), servings: 2 }], catalog })
    const shapes = r.proposals.map(shape)
    expect(shapes).toContain('4,2')
    expect(shapes).toContain('2,2,2')
  })

  it('点数の内訳を返し、足すと score になる。案は点数の良い順', () => {
    const r = run({ anchors: [{ recipe: get('nikujaga'), servings: 2 }] })
    for (const p of r.proposals) {
      const sum = Object.values(p.scoreBreakdown ?? {}).reduce((a, b) => a + b, 0)
      expect(sum).toBeCloseTo(p.score, 2)
    }
    const scores = r.proposals.map((p) => p.score)
    expect(scores).toEqual([...scores].sort((a, b) => a - b))
  })

  it('鍵で固定した料理は食数を変えない。固定していない食べたい料理は配り直す', () => {
    const r = run({
      anchors: [
        { recipe: get('curry'), servings: 2 },
        { recipe: get('nikujaga'), servings: 2 },
      ],
      fixed: [{ recipe: get('curry'), servings: 4 }],
    })
    for (const p of r.proposals) {
      expect(p.recipes.find((x) => x.recipeId === 'curry')).toMatchObject({ servings: 4, role: 'anchor' })
      expect(p.recipes.find((x) => x.recipeId === 'nikujaga')?.role).toBe('anchor')
    }
  })

  it('固定した追加料理は必ず入る', () => {
    const r = run({
      anchors: [{ recipe: get('curry'), servings: 2 }],
      fixed: [{ recipe: get('misoSoup'), servings: 2 }],
    })
    for (const p of r.proposals) {
      expect(p.recipes).toContainEqual(expect.objectContaining({ recipeId: 'misoSoup', role: 'added', servings: 2 }))
    }
  })

  it('食べたい料理だけで目標を超えるときは、選んだときの食数のまま 1 案', () => {
    const anchors = ['curry', 'nikujaga', 'mapo', 'stew'].map((id) => ({ recipe: get(id), servings: 2 }))
    const r = run({ anchors, targetMeals: 4 })
    expect(r.proposals).toHaveLength(1)
    expect(r.proposals[0]?.recipes.map((x) => x.servings)).toEqual([2, 2, 2, 2])
    expect(r.hasMore).toBe(false)
  })

  it('別の案（exclude）を重ねると、同じ組み合わせは二度出ず、いつか出し尽くす', () => {
    const catalog = [get('curry'), get('spinachOhitashi'), get('broccoliSteam'), get('pumpkinNimono')]
    const seen: string[][] = []
    for (let round = 0; round < 20; round++) {
      const r = run({ anchors: [{ recipe: get('curry'), servings: 2 }], catalog, exclude: seen })
      const keys = r.proposals.map((p) =>
        p.recipes
          .map((x) => x.recipeId)
          .sort()
          .join(),
      )
      for (const k of keys) expect(seen.map((s) => [...s].sort().join())).not.toContain(k)
      seen.push(...r.proposals.map((p) => p.recipes.map((x) => x.recipeId)))
      if (!r.hasMore) {
        expect(run({ anchors: [{ recipe: get('curry'), servings: 2 }], catalog, exclude: seen }).proposals).toEqual([])
        return
      }
    }
    throw new Error('出し尽くせなかった')
  })

  it('1.6L で刻みより少ししか作れない料理は追加の候補に出ない。anchor にあれば目標以下でいちばん近い合計にする', () => {
    const tiny = { ...get('spinachOhitashi'), id: 'tiny', maxServings1_6l: 1 }
    const catalog = [...fixtureCatalog, tiny]
    const added = run({ anchors: [{ recipe: get('curry'), servings: 2 }], catalog })
    expect(added.proposals.flatMap((p) => p.recipes.map((x) => x.recipeId))).not.toContain('tiny')
    const withTiny = run({ anchors: [{ recipe: tiny, servings: 1 }], catalog })
    expect(withTiny.proposals.length).toBeGreaterThan(0)
    for (const p of withTiny.proposals) {
      expect(p.recipes.find((x) => x.recipeId === 'tiny')?.servings).toBe(1)
      expect(p.recipes.reduce((a, x) => a + x.servings, 0)).toBe(5)
    }
  })

  it('刻みは 1 にも戻せる', () => {
    const r = run({ anchors: [{ recipe: get('curry'), servings: 1 }], targetMeals: 5, options: { servingsStep: 1 } })
    for (const p of r.proposals) expect(p.recipes.reduce((a, x) => a + x.servings, 0)).toBe(5)
  })
})

describe('重みを変えると結果が変わる', () => {
  const anchors = [{ recipe: get('chickenDaikon'), servings: 2 }]

  it('人気の重みを大きくすると、追加した料理の人気が上がる', () => {
    const features = recipeFeatures(fixtureCatalog, fixtureIngredients)
    const pop = (r: ReturnType<typeof run>) => {
      const added = r.proposals[0]?.recipes.filter((x) => x.role === 'added') ?? []
      return added.reduce((a, x) => a + (features.get(x.recipeId)?.popularity ?? 0), 0) / Math.max(added.length, 1)
    }
    const normal = run({ anchors })
    const popular = run({ anchors, weights: { popularity: 20 } })
    expect(pop(popular)).toBeGreaterThan(pop(normal))
  })

  it('食べ続けの減点をなくしてホットクックの回数を重くすると、品数の少ない案が 1 位になる', () => {
    const few = run({ anchors, weights: { repeat: 0, hotcook: 5 } })
    expect(few.proposals[0]?.recipes).toHaveLength(2)
    const many = run({ anchors, weights: { repeat: 5 } })
    expect(many.proposals[0]?.recipes).toHaveLength(3)
  })

  it('既定の重みは RECOMMEND_WEIGHTS', () => {
    const a = run({ anchors })
    const b = run({ anchors, weights: { ...RECOMMEND_WEIGHTS } })
    expect(a.proposals.map(shape)).toEqual(b.proposals.map(shape))
  })
})

describe('計算量', () => {
  it(`500 件でも評価は ${MAX_EVALUATIONS} 回まで（時間もゆるく確かめる）`, () => {
    const catalog = [...fixtureCatalog, ...syntheticCatalog(500)]
    const started = Date.now()
    const r = recommend({
      anchors: [{ recipe: get('curry'), servings: 2 }],
      catalog,
      available: [],
      ingredients: fixtureIngredients,
      today,
      targetMeals: 8,
    })
    expect(r.evaluations).toBeLessThanOrEqual(MAX_EVALUATIONS)
    expect(r.proposals.length).toBeGreaterThan(0)
    expect(Date.now() - started).toBeLessThan(2000)
  })
})
