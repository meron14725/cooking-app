// 件数が多いときに、1 クエリのバインド変数が D1 の上限（100）を超えないことを確かめる。
// テスト用の D1（testing/d1.ts）は、本物と同じく 100 を超えたら「too many SQL variables」で失敗する。
import { beforeEach, describe, expect, it } from 'vitest'
import { addDays, todayJst } from '../../shared/domain/date'
import type { Ingredient, IngredientInput } from '../../shared/schemas/ingredient'
import type { MealKit } from '../../shared/schemas/kit'
import type { Plan } from '../../shared/schemas/plan'
import type { Recipe, RecipeSummary } from '../../shared/schemas/recipe'
import type { ShoppingList } from '../../shared/schemas/shopping'
import { createTestApi } from '../testing/app'
import { createTestD1, D1_MAX_BOUND_PARAMS } from '../testing/d1'

const RECIPE_COUNT = 600
const INGREDIENT_COUNT = 120

const base = {
  canFreeze: true,
  fridgeDays: 7,
  freezerDays: 30,
  defaultLocation: 'fridge',
  category: 'vegetable',
  unit: 'g',
  preppedFridgeDays: 3,
} satisfies Partial<IngredientInput>

let api: ReturnType<typeof createTestApi>
let foods: Ingredient[]

/** 食材を INGREDIENT_COUNT 種（どれも販売単位つき）作る */
async function makeIngredients() {
  const list: Ingredient[] = []
  for (let i = 0; i < INGREDIENT_COUNT; i++) {
    const res = await api.call<Ingredient>('POST', '/ingredients', {
      ...base,
      name: `食材${String(i).padStart(3, '0')}`,
      packageUnits: [{ label: '1袋', quantity: 100, isDefault: true }],
    })
    expect(res.status).toBe(201)
    list.push(res.body)
  }
  return list
}

function food(i: number): Ingredient {
  return foods[i % foods.length] as Ingredient
}

async function makeRecipe(title: string, parts: Ingredient[]) {
  const res = await api.call<Recipe>('POST', '/recipes', {
    title,
    servings: 1,
    maxServings1_6l: 4,
    ingredients: parts.map((p, n) => ({ ingredientId: p.id, quantity: 50, displayText: `${p.name} 50g`, addOrder: n })),
    steps: [{ phase: 'cook', text: '内鍋に入れて加熱する' }],
  })
  expect(res.status).toBe(201)
  return res.body
}

beforeEach(async () => {
  api = createTestApi()
  foods = await makeIngredients()
})

describe('テスト用 D1 のバインド変数の上限', () => {
  it('100 個までは通り、101 個で D1 と同じエラーになる', async () => {
    const d1 = createTestD1()
    const placeholders = (n: number) => Array.from({ length: n }, () => '?').join(',')
    const values = (n: number) => Array.from({ length: n }, (_, i) => i)
    const ok = await d1
      .prepare(`SELECT 1 WHERE 1 IN (${placeholders(D1_MAX_BOUND_PARAMS)})`)
      .bind(...values(D1_MAX_BOUND_PARAMS))
      .all()
    expect(ok.results).toHaveLength(1)
    expect(() => d1.prepare(`SELECT 1 WHERE 1 IN (${placeholders(101)})`).bind(...values(101))).toThrow(
      /too many SQL variables/,
    )
  })
})

describe(`${RECIPE_COUNT} 件のレシピ`, () => {
  beforeEach(async () => {
    for (let i = 0; i < RECIPE_COUNT; i++) {
      await makeRecipe(`料理${String(i).padStart(3, '0')}`, [food(i), food(i + 1)])
    }
    // 件数のあるもの・ないものを混ぜる
    api.sqlite.exec(
      `UPDATE recipes SET favorite_count = CASE WHEN rowid % 3 = 0 THEN NULL ELSE rowid % 50 END, cook_count = CASE WHEN rowid % 4 = 0 THEN NULL ELSE rowid % 30 END`,
    )
  })

  it.each([
    ['料理名順', ''],
    ['お気に入り順', '?sort=popular'],
    ['作った回数順', '?sort=cooked'],
  ])('%s で絞り込みなしの一覧が取れる', async (_, query) => {
    const res = await api.call<{ items: RecipeSummary[] }>('GET', `/recipes${query}`)
    expect(res.status).toBe(200)
    expect(res.body.items).toHaveLength(RECIPE_COUNT)
    // 材料名も全部のレシピについてくる
    expect(res.body.items.every((r) => r.ingredientNames.length === 2)).toBe(true)
  })

  it('まとめて推定（ルールの段）が通る', async () => {
    const res = await api.call<{ recipes: { updated: number } }>('POST', '/recipes/attributes/estimate', {})
    expect(res.status).toBe(200)
  })

  it('絞り込んだときも、その結果のレシピの材料名がつく', async () => {
    const res = await api.call<{ items: RecipeSummary[] }>('GET', `/recipes?ingredientId=${food(0).id}`)
    expect(res.status).toBe(200)
    // 食材0 は 1 品目（i % 120 = 0）と 2 品目（i % 120 = 119）に使っている
    expect(res.body.items).toHaveLength((RECIPE_COUNT / INGREDIENT_COUNT) * 2)
    for (const r of res.body.items) expect(r.ingredientNames).toContain(food(0).name)
  })
})

describe(`${INGREDIENT_COUNT} 種の食材`, () => {
  it('一覧が販売単位つきで取れる', async () => {
    const res = await api.call<{ items: Ingredient[] }>('GET', '/ingredients')
    expect(res.status).toBe(200)
    expect(res.body.items).toHaveLength(INGREDIENT_COUNT)
    expect(res.body.items.every((i) => i.packageUnits.length === 1)).toBe(true)
  })
})

describe('材料の多い献立（10 品 × 12 種 = 120 種）', () => {
  it('確定 → 買い物 → 下ごしらえ → 袋詰め → 袋の一覧まで通る', async () => {
    const today = todayJst()
    const dishes: Recipe[] = []
    for (let d = 0; d < 10; d++) {
      dishes.push(
        await makeRecipe(
          `献立の料理${d}`,
          Array.from({ length: 12 }, (_, k) => food(d * 12 + k)),
        ),
      )
    }
    const plan = (await api.call<Plan>('POST', '/plans', { anchors: [{ recipeId: dishes[0]?.id }] })).body
    const put = await api.call('PUT', `/plans/${plan.id}/recipes`, {
      recipes: dishes.map((r, i) => ({
        recipeId: r.id,
        role: i === 0 ? 'anchor' : 'added',
        servings: 1,
        dayIndex: i + 1,
      })),
    })
    expect(put.status).toBe(200)
    expect((await api.call('POST', `/plans/${plan.id}/confirm`, { startsOn: addDays(today, 1) })).status).toBe(200)

    const list = await api.call<ShoppingList>('GET', `/plans/${plan.id}/shopping`)
    expect(list.status).toBe(200)
    expect(list.body.items).toHaveLength(INGREDIENT_COUNT)
    for (const item of list.body.items) await api.call('POST', `/shopping-items/${item.id}/check`)
    expect((await api.call('POST', `/plans/${plan.id}/shopping/complete`)).status).toBe(200)

    expect((await api.call('GET', `/plans/${plan.id}/prep`)).status).toBe(200)
    expect((await api.call('POST', `/plans/${plan.id}/kits`, {})).status).toBe(201)

    // 袋を 160 個に増やしても一覧が取れる（同じ袋を中身ごと複製する）
    const originals = api.sqlite.prepare('SELECT id FROM meal_kits').all() as { id: string }[]
    expect(originals).toHaveLength(10)
    // 献立と料理の組み合わせは 1 袋ずつなので、複製ごとに献立も複製する
    const copyPlan = api.sqlite.prepare(
      `INSERT INTO plans (id, status, starts_on, confirmed_at) SELECT ?, status, starts_on, confirmed_at FROM plans WHERE id = ?`,
    )
    const copyKit = api.sqlite.prepare(
      `INSERT INTO meal_kits (id, plan_id, recipe_id, servings, location, packed_on, planned_on, use_by, status)
       SELECT ?, ?, recipe_id, servings, location, packed_on, planned_on, use_by, status FROM meal_kits WHERE id = ?`,
    )
    const copyItems = api.sqlite.prepare(
      `INSERT INTO meal_kit_items (id, meal_kit_id, ingredient_id, quantity, state, before_cook_task)
       SELECT ? || id, ?, ingredient_id, quantity, state, before_cook_task FROM meal_kit_items WHERE meal_kit_id = ?`,
    )
    for (let n = 0; n < 15; n++) {
      const planCopy = `${plan.id}-${n}`
      copyPlan.run(planCopy, plan.id)
      for (const { id } of originals) {
        const copy = `${id}-${n}`
        copyKit.run(copy, planCopy, id)
        copyItems.run(`${copy}-`, copy, id)
      }
    }
    const kits = await api.call<{ items: MealKit[] }>('GET', '/kits')
    expect(kits.status).toBe(200)
    expect(kits.body.items).toHaveLength(160)
    expect(kits.body.items.every((k) => k.items.length > 0)).toBe(true)
  })
})
