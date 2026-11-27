import { beforeEach, describe, expect, it } from 'vitest'
import { addDays, todayJst } from '../../shared/domain/date'
import type { Ingredient, IngredientInput } from '../../shared/schemas/ingredient'
import type { InventoryItem } from '../../shared/schemas/inventory'
import type { Plan, ProposalView } from '../../shared/schemas/plan'
import type { Recipe, RecipeInput } from '../../shared/schemas/recipe'
import type { ShoppingItem, ShoppingList } from '../../shared/schemas/shopping'
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
let soy: Ingredient
let nabe: Recipe
const today = todayJst()

function recipe(title: string, parts: [Ingredient, number][]): RecipeInput {
  return {
    title,
    servings: 1,
    caloriesKcal: 400,
    maxServings1_6l: 4,
    ingredients: parts.map(([i, quantity], n) => ({
      ingredientId: i.id,
      quantity,
      displayText: `${i.name} ${quantity}${i.unit}`,
      addOrder: n + 1,
    })),
    steps: [{ phase: 'cook', text: '内鍋に入れて加熱する' }],
  }
}

beforeEach(async () => {
  api = createTestApi()
  const make = async (body: Record<string, unknown>) => (await api.call<Ingredient>('POST', '/ingredients', body)).body
  // 肉を先に作っても、一覧は売り場順（野菜 → 肉 → 調味料）
  pork = await make({
    ...base,
    name: '豚こま切れ肉',
    category: 'meat',
    unit: 'g',
    packageUnits: [
      { label: '200gパック', quantity: 200, isDefault: true },
      { label: '400gパック', quantity: 400 },
    ],
  })
  cabbage = await make({
    ...base,
    name: 'キャベツ',
    category: 'vegetable',
    unit: '個',
    canFreeze: false,
    freezerDays: null,
    fridgeDays: 7,
    packageUnits: [{ label: '1玉', quantity: 1, isDefault: true }],
  })
  soy = await make({ ...base, name: '醤油', category: 'seasoning', unit: 'ml', defaultLocation: 'pantry' })
  nabe = (
    await api.call<Recipe>(
      'POST',
      '/recipes',
      recipe('豚キャベツ鍋', [
        [cabbage, 0.5],
        [pork, 150],
      ]),
    )
  ).body
})

/** 1 品だけの献立を作って確定する */
async function confirmed(): Promise<Plan> {
  const plan = (await api.call<Plan>('POST', '/plans', { anchors: [{ recipeId: nabe.id }] })).body
  return (await api.call<Plan>('POST', `/plans/${plan.id}/confirm`, { startsOn: addDays(today, 1) })).body
}

const list = async (planId: string) => (await api.call<ShoppingList>('GET', `/plans/${planId}/shopping`)).body.items
const inventory = async () => (await api.call<{ items: InventoryItem[] }>('GET', '/inventory')).body.items

describe('買い物リスト', () => {
  it('確定すると、そのときの在庫で足りない分が売り場順に入る', async () => {
    const plan = await confirmed()
    const items = await list(plan.id)
    expect(items.map((i) => [i.name, i.packageLabel, i.packageCount, i.buyQuantity, i.needQuantity])).toEqual([
      ['キャベツ', '1玉', 1, 1, 0.5],
      ['豚こま切れ肉', '200gパック', 1, 200, 150],
    ])
    expect(items[0]).toMatchObject({ checkedAt: null, isManual: false, usedFor: ['豚キャベツ鍋'] })
    expect(items[1]?.packageUnits.map((u) => u.label)).toEqual(['200gパック', '400gパック'])
  })

  it('在庫で足りる食材は載らない', async () => {
    await api.call('POST', '/inventory', { ingredientId: pork.id, quantity: 300 })
    const plan = await confirmed()
    expect((await list(plan.id)).map((i) => i.name)).toEqual(['キャベツ'])
  })

  it('チェックすると在庫ができ、再送しても二重にならない。外すと消える', async () => {
    const plan = await confirmed()
    const item = (await list(plan.id))[0] as ShoppingItem
    const res = await api.call<ShoppingItem>('POST', `/shopping-items/${item.id}/check`)
    expect(res.status).toBe(200)
    expect(res.body.checkedAt).not.toBeNull()
    await api.call('POST', `/shopping-items/${item.id}/check`)
    const stock = await inventory()
    expect(stock).toHaveLength(1)
    expect(stock[0]).toMatchObject({
      name: 'キャベツ',
      quantity: 1,
      location: 'fridge',
      source: 'shopping',
      purchasedOn: today,
      expiresOn: addDays(today, 7),
    })

    const off = await api.call<ShoppingItem>('POST', `/shopping-items/${item.id}/uncheck`)
    expect(off.body.checkedAt).toBeNull()
    expect(await inventory()).toHaveLength(0)
    expect((await api.call('POST', `/shopping-items/${item.id}/uncheck`)).status).toBe(200)
  })

  it('違うパックを買ったら直せる。チェック済みなら在庫の量も変わる', async () => {
    const plan = await confirmed()
    const porkRow = (await list(plan.id)).find((i) => i.name === '豚こま切れ肉') as ShoppingItem
    await api.call('POST', `/shopping-items/${porkRow.id}/check`)
    const big = porkRow.packageUnits.find((u) => u.label === '400gパック')
    const res = await api.call<ShoppingItem>('PATCH', `/shopping-items/${porkRow.id}`, { packageUnitId: big?.id })
    expect(res.body).toMatchObject({ packageLabel: '400gパック', packageCount: 1, buyQuantity: 400 })
    expect((await inventory())[0]?.quantity).toBe(400)

    const two = await api.call<ShoppingItem>('PATCH', `/shopping-items/${porkRow.id}`, { packageCount: 2 })
    expect(two.body.buyQuantity).toBe(800)
    // 量り売りに切り替え
    const loose = await api.call<ShoppingItem>('PATCH', `/shopping-items/${porkRow.id}`, {
      packageUnitId: null,
      quantity: 180,
    })
    expect(loose.body).toMatchObject({ packageUnitId: null, packageLabel: null, buyQuantity: 180 })
    expect((await inventory())[0]?.quantity).toBe(180)
    // チェック済みのまま 0 にはできない
    expect((await api.call('PATCH', `/shopping-items/${porkRow.id}`, { quantity: 0 })).status).toBe(400)
  })

  it('他の食材の販売単位は使えない', async () => {
    const plan = await confirmed()
    const cabbageRow = (await list(plan.id)).find((i) => i.name === 'キャベツ') as ShoppingItem
    const porkUnit = (await list(plan.id)).find((i) => i.name === '豚こま切れ肉')?.packageUnits[0]
    const res = await api.call('PATCH', `/shopping-items/${cabbageRow.id}`, { packageUnitId: porkUnit?.id })
    expect(res.status).toBe(400)
  })

  it('手で行を足せる。チェックしていない行は消せる', async () => {
    const plan = await confirmed()
    const added = await api.call<ShoppingItem>('POST', `/plans/${plan.id}/shopping`, {
      ingredientId: soy.id,
      quantity: 500,
    })
    expect(added.status).toBe(201)
    expect(added.body).toMatchObject({ name: '醤油', isManual: true, needQuantity: 0, buyQuantity: 500 })
    expect((await list(plan.id)).map((i) => i.name)).toEqual(['キャベツ', '豚こま切れ肉', '醤油'])

    expect((await api.call('POST', `/plans/${plan.id}/shopping`, { ingredientId: soy.id })).status).toBe(400)

    await api.call('POST', `/shopping-items/${added.body.id}/check`)
    expect((await inventory())[0]).toMatchObject({ name: '醤油', location: 'pantry' })
    expect((await api.call('DELETE', `/shopping-items/${added.body.id}`)).status).toBe(409)
    await api.call('POST', `/shopping-items/${added.body.id}/uncheck`)
    expect((await api.call('DELETE', `/shopping-items/${added.body.id}`)).status).toBe(204)
  })

  it('買い物完了で prepping になり、以降はリストを変えられない', async () => {
    const plan = await confirmed()
    const item = (await list(plan.id))[0] as ShoppingItem
    const done = await api.call<Plan>('POST', `/plans/${plan.id}/shopping/complete`)
    expect(done.body.status).toBe('prepping')
    expect((await api.call('POST', `/shopping-items/${item.id}/check`)).status).toBe(409)
    expect((await api.call('POST', `/plans/${plan.id}/shopping`, { ingredientId: soy.id, quantity: 1 })).status).toBe(
      409,
    )
    expect((await api.call('POST', `/plans/${plan.id}/shopping/complete`)).status).toBe(409)
    expect(await list(plan.id)).toHaveLength(2)
    // 下ごしらえを始めたら取り消せない
    expect((await api.call('DELETE', `/plans/${plan.id}`)).status).toBe(409)
  })

  it('買い物中に献立を取り消しても、買った在庫は残る', async () => {
    const plan = await confirmed()
    const item = (await list(plan.id))[0] as ShoppingItem
    await api.call('POST', `/shopping-items/${item.id}/check`)
    expect((await api.call('DELETE', `/plans/${plan.id}`)).status).toBe(204)
    expect(await inventory()).toHaveLength(1)
  })
})

describe('確定の入力チェック', () => {
  it('1日目が過去の日付なら 400', async () => {
    const plan = (await api.call<Plan>('POST', '/plans', { anchors: [{ recipeId: nabe.id }] })).body
    const res = await api.call('POST', `/plans/${plan.id}/confirm`, { startsOn: addDays(today, -1) })
    expect(res.status).toBe(400)
    expect((await api.call('POST', `/plans/${plan.id}/confirm`, { startsOn: today })).status).toBe(200)
  })

  it('同じ日に 2 品は入れられない', async () => {
    const other = (await api.call<Recipe>('POST', '/recipes', recipe('キャベツの浅漬け', [[cabbage, 0.5]]))).body
    const plan = (await api.call<Plan>('POST', '/plans', { anchors: [{ recipeId: nabe.id }] })).body
    const res = await api.call('PUT', `/plans/${plan.id}/recipes`, {
      recipes: [
        { recipeId: nabe.id, role: 'anchor', servings: 1, dayIndex: 1 },
        { recipeId: other.id, role: 'added', servings: 1, dayIndex: 1 },
      ],
    })
    expect(res.status).toBe(400)
  })

  it('献立の料理があとで削除されても、評価に残り注意が出る', async () => {
    const plan = (await api.call<Plan>('POST', '/plans', { anchors: [{ recipeId: nabe.id }] })).body
    await api.call('DELETE', `/recipes/${nabe.id}`)
    const ev = (await api.call<ProposalView>('GET', `/plans/${plan.id}/evaluation`)).body
    expect(ev.recipes.map((r) => r.title)).toEqual(['豚キャベツ鍋'])
    expect(ev.warnings).toContain('豚キャベツ鍋: 削除済みのレシピです')
    expect(ev.shopping.map((s) => s.name)).toEqual(['キャベツ', '豚こま切れ肉'])
  })
})
