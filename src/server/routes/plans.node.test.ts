import { beforeEach, describe, expect, it } from 'vitest'
import { addDays, todayJst } from '../../shared/domain/date'
import type { Ingredient, IngredientInput } from '../../shared/schemas/ingredient'
import type { Plan, ProposalView, RecommendationsResponse } from '../../shared/schemas/plan'
import type { Recipe, RecipeInput } from '../../shared/schemas/recipe'
import { createTestApi } from '../testing/app'

const base = {
  canFreeze: true,
  fridgeDays: 3,
  freezerDays: 30,
  defaultLocation: 'fridge',
} satisfies Partial<IngredientInput>

let api: ReturnType<typeof createTestApi>
let cabbage: Ingredient
let pork: Ingredient
let carrot: Ingredient
const today = todayJst()

function recipe(title: string, parts: [Ingredient, number][], overrides: Partial<RecipeInput> = {}): RecipeInput {
  return {
    title,
    servings: 2,
    caloriesKcal: 400,
    maxServings1_6l: 4,
    ingredients: parts.map(([i, quantity], n) => ({
      ingredientId: i.id,
      quantity,
      displayText: `${i.name} ${quantity}${i.unit}`,
      addOrder: n + 1,
    })),
    steps: [{ phase: 'cook', text: '内鍋に入れて加熱する' }],
    ...overrides,
  }
}

const createRecipe = async (input: RecipeInput) => (await api.call<Recipe>('POST', '/recipes', input)).body

let anchor: Recipe
let partner: Recipe
let other: Recipe

beforeEach(async () => {
  api = createTestApi()
  const make = async (body: Record<string, unknown>) => (await api.call<Ingredient>('POST', '/ingredients', body)).body
  cabbage = await make({
    ...base,
    name: 'キャベツ',
    category: 'vegetable',
    unit: '個',
    canFreeze: false,
    freezerDays: null,
    packageUnits: [{ label: '1玉', quantity: 1, isDefault: true }],
  })
  pork = await make({
    ...base,
    name: '豚こま切れ肉',
    category: 'meat',
    unit: 'g',
    packageUnits: [{ label: '300gパック', quantity: 300, isDefault: true }],
  })
  carrot = await make({ ...base, name: 'にんじん', category: 'vegetable', unit: '本' })
  // 起点は 2 人前でキャベツ半玉 + 豚 150g。相方（1 人前で同量）と合わせると 1 玉・1 パックを使い切れる
  anchor = await createRecipe(
    recipe('キャベツと豚の蒸し煮', [
      [cabbage, 0.5],
      [pork, 150],
    ]),
  )
  partner = await createRecipe(
    recipe(
      '豚キャベツのスープ',
      [
        [cabbage, 0.5],
        [pork, 150],
      ],
      { servings: 1 },
    ),
  )
  other = await createRecipe(recipe('にんじんのグラッセ', [[carrot, 2]]))
})

const createPlan = (anchors: { recipeId: string; servings?: number }[]) => api.call<Plan>('POST', '/plans', { anchors })

describe('献立 API', () => {
  it('食べたい料理を選んで draft を作る。進行中の献立は current で取れる', async () => {
    expect((await api.call<{ plan: Plan | null }>('GET', '/plans/current')).body.plan).toBeNull()
    const res = await createPlan([{ recipeId: anchor.id }])
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ status: 'draft', startsOn: null, confirmedAt: null })
    expect(res.body.recipes).toMatchObject([
      { recipeId: anchor.id, title: anchor.title, role: 'anchor', servings: 1, dayIndex: 1 },
    ])
    const current = await api.call<{ plan: Plan | null }>('GET', '/plans/current')
    expect(current.body.plan?.id).toBe(res.body.id)
  })

  it('進行中の献立があると作れない。存在しないレシピ・重複は 400', async () => {
    await createPlan([{ recipeId: anchor.id }])
    const again = await createPlan([{ recipeId: other.id }])
    expect(again.status).toBe(409)
    expect(again.body).toMatchObject({ error: { code: 'PLAN_IN_PROGRESS' } })

    const fresh = createTestApi()
    const unknown = await fresh.call('POST', '/plans', { anchors: [{ recipeId: 'nope' }] })
    expect(unknown.status).toBe(400)
    expect(unknown.body).toMatchObject({ error: { code: 'UNKNOWN_RECIPE' } })
  })

  it('食べたい料理の食数は MAX_SERVINGS_PER_DISH（4）まで', async () => {
    expect((await createPlan([{ recipeId: anchor.id, servings: 4 }])).status).toBe(201)
    await api.call('DELETE', `/plans/${(await api.call<{ plan: Plan }>('GET', '/plans/current')).body.plan.id}`)
    expect((await createPlan([{ recipeId: anchor.id, servings: 5 }])).status).toBe(400)
  })

  it('同じ料理を 2 回選ぶと 400', async () => {
    const res = await createPlan([{ recipeId: anchor.id }, { recipeId: anchor.id }])
    expect(res.status).toBe(400)
  })

  it('提案: 選んだ料理を含み、余りが少ない組み合わせが先頭。料理名とカロリーが付く', async () => {
    // 2 食分ずつなら、相方と合わせてキャベツ 1 玉・豚 300g をちょうど使い切る
    const plan = (await createPlan([{ recipeId: anchor.id, servings: 2 }])).body
    const res = await api.call<RecommendationsResponse>('POST', `/plans/${plan.id}/recommendations`, {})
    expect(res.status).toBe(200)
    const best = res.body.proposals[0]
    expect(best).toBeDefined()
    expect(best?.recipes.map((r) => r.recipeId)).toContain(anchor.id)
    expect(best?.recipes.map((r) => r.recipeId)).toContain(partner.id)
    expect(best?.recipes.find((r) => r.recipeId === anchor.id)).toMatchObject({
      role: 'anchor',
      title: anchor.title,
      caloriesKcal: 400,
    })
    expect(best?.shopping.map((s) => [s.name, s.packageLabel, s.packageCount])).toEqual(
      expect.arrayContaining([
        ['キャベツ', '1玉', 1],
        ['豚こま切れ肉', '300gパック', 1],
      ]),
    )
    // 価格は未設定なので 0 円で、未設定の食材として数える（docs/design/10-cost.md）
    const meals = best?.recipes.reduce((n, r) => n + r.servings, 0)
    expect(best?.cost).toMatchObject({ buyYen: 0, totalMeals: meals, hasUnpriced: true })
    expect(best?.cost.unpriced.map((u) => u.name)).toEqual(expect.arrayContaining(['キャベツ', '豚こま切れ肉']))
    expect(best?.leftovers.filter((l) => l.perishable)).toEqual([])
    expect(best?.totalCaloriesKcal).not.toBeNull()
  })

  it('別の案: 出した案を exclude に渡すと、それ以外の組み合わせを返す', async () => {
    const plan = (await createPlan([{ recipeId: anchor.id }])).body
    const url = `/plans/${plan.id}/recommendations`
    const first = await api.call<RecommendationsResponse>('POST', url, {})
    const exclude = first.body.proposals.map((p) => p.recipes.map((r) => r.recipeId))
    const second = await api.call<RecommendationsResponse>('POST', url, { exclude })
    expect(second.status).toBe(200)
    const key = (ids: string[]) => [...ids].sort().join()
    const shown = new Set(exclude.map(key))
    for (const p of second.body.proposals) expect(shown.has(key(p.recipes.map((r) => r.recipeId)))).toBe(false)
    expect(typeof second.body.hasMore).toBe('boolean')
    expect((await api.call('POST', url, { exclude: 'x' })).status).toBe(400)
  })

  it('保存していない並びを評価する（食分を変えたとき）。献立は変わらない', async () => {
    const plan = (await createPlan([{ recipeId: anchor.id }])).body
    const recipes = [
      { recipeId: anchor.id, role: 'anchor', servings: 1, dayIndex: 1 },
      { recipeId: partner.id, role: 'added', servings: 1, dayIndex: 2 },
    ]
    const url = `/plans/${plan.id}/evaluation`
    const one = await api.call<ProposalView>('POST', url, { recipes })
    expect(one.status).toBe(200)
    const three = await api.call<ProposalView>('POST', url, {
      recipes: recipes.map((r) => (r.recipeId === partner.id ? { ...r, servings: 3 } : r)),
    })
    expect(three.body.recipes.find((r) => r.recipeId === partner.id)?.servings).toBe(3)
    expect(three.body.totalCaloriesKcal).not.toBe(one.body.totalCaloriesKcal)
    for (const l of three.body.leftovers) expect(typeof l.packs).toBe('number')
    // 献立は保存されていない
    const saved = await api.call<Plan>('GET', `/plans/${plan.id}`)
    expect(saved.body.recipes.map((r) => r.recipeId)).toEqual([anchor.id])
    // 知らないレシピは 400
    const unknown = await api.call('POST', url, { recipes: [{ ...recipes[0], recipeId: 'nope' }] })
    expect(unknown.status).toBe(400)
  })

  it('鍵で固定: 固定した料理と食数を必ず含めて残りを選ぶ。知らないレシピは 400', async () => {
    const plan = (await createPlan([{ recipeId: anchor.id }])).body
    const url = `/plans/${plan.id}/recommendations`
    const res = await api.call<RecommendationsResponse>('POST', url, { fixed: [{ recipeId: partner.id, servings: 2 }] })
    expect(res.status).toBe(200)
    expect(res.body.proposals.length).toBeGreaterThan(0)
    for (const p of res.body.proposals) {
      expect(p.recipes).toContainEqual(expect.objectContaining({ recipeId: partner.id, role: 'added', servings: 2 }))
    }
    expect((await api.call('POST', url, { fixed: [{ recipeId: 'nope', servings: 1 }] })).status).toBe(400)
    // 1 品の食数は MAX_SERVINGS_PER_DISH（4）まで
    expect((await api.call('POST', url, { fixed: [{ recipeId: partner.id, servings: 5 }] })).status).toBe(400)
    expect(
      (
        await api.call('POST', url, {
          fixed: [
            { recipeId: partner.id, servings: 1 },
            { recipeId: partner.id, servings: 2 },
          ],
        })
      ).status,
    ).toBe(400)
  })

  it('提案は在庫を先に使う（確保分を超えた量は使わない）', async () => {
    await api.call('POST', '/inventory', {
      ingredientId: pork.id,
      quantity: 300,
      expiresOn: addDays(today, 1),
    })
    const plan = (await createPlan([{ recipeId: anchor.id }])).body
    const res = await api.call<RecommendationsResponse>('POST', `/plans/${plan.id}/recommendations`, {})
    const best = res.body.proposals[0]
    expect(best?.usesInventory.map((u) => u.name)).toContain('豚こま切れ肉')
    expect(best?.shopping.map((s) => s.name)).not.toContain('豚こま切れ肉')
  })

  it('レシピを置き換えて、食べる順と食数を決める', async () => {
    const plan = (await createPlan([{ recipeId: anchor.id }])).body
    const res = await api.call<Plan>('PUT', `/plans/${plan.id}/recipes`, {
      recipes: [
        { recipeId: partner.id, role: 'added', servings: 3, dayIndex: 1 },
        { recipeId: anchor.id, role: 'anchor', servings: 2, dayIndex: 2 },
      ],
    })
    expect(res.status).toBe(200)
    expect(res.body.recipes.map((r) => [r.recipeId, r.role, r.servings, r.dayIndex])).toEqual([
      [partner.id, 'added', 3, 1],
      [anchor.id, 'anchor', 2, 2],
    ])
    const evaluation = await api.call<ProposalView>('GET', `/plans/${plan.id}/evaluation`)
    expect(evaluation.status).toBe(200)
    expect(evaluation.body.recipes.map((r) => [r.title, r.dayIndex])).toEqual([
      [partner.title, 1],
      [anchor.title, 2],
    ])
    // 1 人前のレシピを 3 食分 + 2 人前を 2 食分 = キャベツ 2 玉、豚 600g
    expect(evaluation.body.shopping.map((s) => [s.name, s.packageCount])).toEqual(
      expect.arrayContaining([
        ['キャベツ', 2],
        ['豚こま切れ肉', 2],
      ]),
    )
    expect(evaluation.body.kitLocations).toHaveLength(2)
    const dup = await api.call('PUT', `/plans/${plan.id}/recipes`, {
      recipes: [
        { recipeId: anchor.id, role: 'anchor', servings: 2, dayIndex: 1 },
        { recipeId: anchor.id, role: 'added', servings: 2, dayIndex: 2 },
      ],
    })
    expect(dup.status).toBe(400)
  })

  it('確定すると shopping になり、以降は変更・提案できない（取り消しはできる）', async () => {
    const plan = (await createPlan([{ recipeId: anchor.id }])).body
    const startsOn = addDays(today, 1)
    const res = await api.call<Plan>('POST', `/plans/${plan.id}/confirm`, { startsOn })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ status: 'shopping', startsOn })
    expect(res.body.confirmedAt).not.toBeNull()

    const body = { recipes: [{ recipeId: other.id, role: 'added', servings: 2, dayIndex: 1 }] }
    expect((await api.call('PUT', `/plans/${plan.id}/recipes`, body)).status).toBe(409)
    expect((await api.call('POST', `/plans/${plan.id}/recommendations`, {})).status).toBe(409)
    expect((await api.call('POST', `/plans/${plan.id}/confirm`, { startsOn })).status).toBe(409)
    // 進行中なので新しい献立は作れない
    expect((await createPlan([{ recipeId: other.id }])).status).toBe(409)
    // 買い物中なら取り消せる
    expect((await api.call('DELETE', `/plans/${plan.id}`)).status).toBe(204)
    expect((await createPlan([{ recipeId: other.id }])).status).toBe(201)
  })

  it('draft は破棄でき、破棄後は新しく作れる', async () => {
    const plan = (await createPlan([{ recipeId: anchor.id }])).body
    expect((await api.call('DELETE', `/plans/${plan.id}`)).status).toBe(204)
    expect((await api.call('GET', `/plans/${plan.id}`)).status).toBe(404)
    expect((await createPlan([{ recipeId: other.id }])).status).toBe(201)
  })

  it('確定の日付は YYYY-MM-DD', async () => {
    const plan = (await createPlan([{ recipeId: anchor.id }])).body
    expect((await api.call('POST', `/plans/${plan.id}/confirm`, { startsOn: '明日' })).status).toBe(400)
  })
})
