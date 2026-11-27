import { beforeEach, describe, expect, it } from 'vitest'
import { addDays, todayJst } from '../../shared/domain/date'
import type { Ingredient, IngredientInput } from '../../shared/schemas/ingredient'
import type { FridgeEntry, InventoryItem } from '../../shared/schemas/inventory'
import type { Recipe } from '../../shared/schemas/recipe'
import { createTestApi } from '../testing/app'

let api: ReturnType<typeof createTestApi>
let tofu: Ingredient
let pork: Ingredient
const today = todayJst()

const base = {
  canFreeze: true,
  fridgeDays: 3,
  freezerDays: 30,
  defaultLocation: 'fridge',
} satisfies Partial<IngredientInput>

beforeEach(async () => {
  api = createTestApi()
  tofu = (
    await api.call<Ingredient>('POST', '/ingredients', {
      ...base,
      name: '木綿豆腐',
      category: 'tofu_egg_dairy',
      unit: '丁',
      canFreeze: false,
      freezerDays: null,
      fridgeDays: 5,
    })
  ).body
  pork = (
    await api.call<Ingredient>('POST', '/ingredients', { ...base, name: '豚こま切れ肉', category: 'meat', unit: 'g' })
  ).body
})

const add = (body: Record<string, unknown>) => api.call<InventoryItem>('POST', '/inventory', body)

describe('在庫 API', () => {
  it('追加すると購入日 = 今日、場所 = マスタの既定、期限は日持ちから計算', async () => {
    const res = await add({ ingredientId: tofu.id, quantity: 2 })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      name: '木綿豆腐',
      unit: '丁',
      quantity: 2,
      location: 'fridge',
      purchasedOn: today,
      expiresOn: addDays(today, 5),
      source: 'manual',
      daysLeft: 5,
      isExpiringSoon: false,
      reservedQuantity: 0,
    })
  })

  it('期限と購入日を指定できる。冷凍できない食材を冷凍にすると 400', async () => {
    const res = await add({ ingredientId: pork.id, quantity: 200, purchasedOn: addDays(today, -3), expiresOn: today })
    expect(res.body).toMatchObject({ expiresOn: today, daysLeft: 0, isExpiringSoon: true, expiryStatus: 'soon' })
    const frozen = await add({ ingredientId: tofu.id, quantity: 1, location: 'freezer' })
    expect(frozen.status).toBe(400)
  })

  it('一覧は期限の近い順', async () => {
    await add({ ingredientId: tofu.id, quantity: 1 })
    await add({ ingredientId: pork.id, quantity: 200 })
    const list = await api.call<{ items: InventoryItem[] }>('GET', '/inventory')
    expect(list.body.items.map((i) => i.name)).toEqual(['豚こま切れ肉', '木綿豆腐'])
  })

  it('場所だけ変えると購入日から期限を計算し直す。期限を指定すればそれを使う', async () => {
    const { body: item } = await add({ ingredientId: pork.id, quantity: 200 })
    const frozen = await api.call<InventoryItem>('PATCH', `/inventory/${item.id}`, { location: 'freezer' })
    expect(frozen.body).toMatchObject({ location: 'freezer', expiresOn: addDays(today, 30) })
    const fixed = await api.call<InventoryItem>('PATCH', `/inventory/${item.id}`, {
      quantity: 150,
      expiresOn: addDays(today, 10),
    })
    expect(fixed.body).toMatchObject({ quantity: 150, location: 'freezer', expiresOn: addDays(today, 10) })
  })

  it('量を 0 にするか、使い切りにすると一覧から消える', async () => {
    const { body: a } = await add({ ingredientId: pork.id, quantity: 200 })
    const { body: b } = await add({ ingredientId: tofu.id, quantity: 1 })
    expect((await api.call('PATCH', `/inventory/${a.id}`, { quantity: 0 })).status).toBe(204)
    expect((await api.call('POST', `/inventory/${b.id}/use-up`)).status).toBe(204)
    expect((await api.call<{ items: InventoryItem[] }>('GET', '/inventory')).body.items).toEqual([])
    expect((await api.call('POST', `/inventory/${b.id}/use-up`)).status).toBe(404)
  })

  it('空の PATCH やマスタにない食材は 400', async () => {
    const { body } = await add({ ingredientId: pork.id, quantity: 200 })
    expect((await api.call('PATCH', `/inventory/${body.id}`, {})).status).toBe(400)
    expect((await add({ ingredientId: 'nope', quantity: 1 })).status).toBe(400)
  })
})

describe('袋用の確保と冷蔵庫ビュー', () => {
  async function storeKit(opts: { status?: string; tofuQuantity: number }) {
    const { body: recipe } = await api.call<Recipe>('POST', '/recipes', {
      title: '麻婆豆腐',
      servings: 2,
      ingredients: [{ ingredientId: tofu.id, quantity: 1, displayText: '豆腐 1丁' }],
    })
    const planId = `plan-${opts.status ?? 'stored'}-${Math.random()}`
    api.sqlite.prepare("INSERT INTO plans (id, status) VALUES (?, 'stored')").run(planId)
    const kitId = `kit-${planId}`
    api.sqlite
      .prepare(
        "INSERT INTO meal_kits (id, plan_id, recipe_id, servings, location, packed_on, planned_on, use_by, status) VALUES (?, ?, ?, 2, 'freezer', ?, ?, ?, ?)",
      )
      .run(kitId, planId, recipe.id, today, addDays(today, 3), addDays(today, 21), opts.status ?? 'stored')
    api.sqlite
      .prepare(
        "INSERT INTO meal_kit_items (id, meal_kit_id, ingredient_id, quantity, state) VALUES (?, ?, ?, ?, 'before_cook')",
      )
      .run(`item-${kitId}`, kitId, tofu.id, opts.tofuQuantity)
    return kitId
  }

  it('stored の袋の before_cook は期限の近い在庫行から確保され、冷蔵庫ビューに「〇〇の袋用」と出る', async () => {
    const { body: early } = await add({ ingredientId: tofu.id, quantity: 1, expiresOn: addDays(today, 2) })
    const { body: late } = await add({ ingredientId: tofu.id, quantity: 2, expiresOn: addDays(today, 6) })
    await storeKit({ tofuQuantity: 1.5 })
    await storeKit({ status: 'cooked', tofuQuantity: 5 })

    const items = (await api.call<{ items: InventoryItem[] }>('GET', '/inventory')).body.items
    expect(items.find((i) => i.id === early.id)).toMatchObject({ reservedQuantity: 1, reservedFor: ['麻婆豆腐'] })
    expect(items.find((i) => i.id === late.id)).toMatchObject({ reservedQuantity: 0.5 })

    const fridge = (await api.call<{ items: FridgeEntry[] }>('GET', '/fridge')).body.items
    expect(fridge.map((e) => [e.kind, e.name, e.reservedFor])).toEqual([
      ['ingredient', '木綿豆腐', '麻婆豆腐の袋用'],
      ['ingredient', '木綿豆腐', '麻婆豆腐の袋用（0.5丁）'],
      ['meal_kit', '麻婆豆腐', null],
    ])
    expect(fridge[2]).toMatchObject({ quantityText: '2食分', location: 'freezer', plannedOn: addDays(today, 3) })
  })

  it('冷蔵庫ビューは場所・種類・期限間近で絞り込める', async () => {
    await add({ ingredientId: pork.id, quantity: 200, location: 'freezer' })
    await add({ ingredientId: tofu.id, quantity: 1, expiresOn: addDays(today, 1) })
    await storeKit({ tofuQuantity: 0.5 })
    const names = async (qs: string) =>
      (await api.call<{ items: FridgeEntry[] }>('GET', `/fridge${qs}`)).body.items.map((e) => e.name)
    expect(await names('?location=freezer')).toEqual(['麻婆豆腐', '豚こま切れ肉'])
    expect(await names('?kind=meal_kit')).toEqual(['麻婆豆腐'])
    expect(await names('?expiringSoon=true')).toEqual(['木綿豆腐'])
  })
})
