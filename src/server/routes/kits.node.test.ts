import { beforeEach, describe, expect, it } from 'vitest'
import { addDays, todayJst } from '../../shared/domain/date'
import type { Ingredient, IngredientInput } from '../../shared/schemas/ingredient'
import type { FridgeEntry, InventoryItem } from '../../shared/schemas/inventory'
import type { PrepView } from '../../shared/schemas/kit'
import type { Plan } from '../../shared/schemas/plan'
import type { Recipe, RecipeInput } from '../../shared/schemas/recipe'
import type { ShoppingList } from '../../shared/schemas/shopping'
import { createTestApi } from '../testing/app'

const base = {
  canFreeze: true,
  fridgeDays: 7,
  freezerDays: 30,
  defaultLocation: 'fridge',
} satisfies Partial<IngredientInput>

let api: ReturnType<typeof createTestApi>
let nikujaga: Recipe
let nimono: Recipe
const today = todayJst()
const tomorrow = addDays(today, 1)

type Part = [Ingredient, number, string | null]
function recipe(title: string, parts: Part[]): RecipeInput {
  return {
    title,
    servings: 1,
    caloriesKcal: 400,
    maxServings1_6l: 4,
    ingredients: parts.map(([i, quantity, cutStyle], n) => ({
      ingredientId: i.id,
      quantity,
      displayText: `${i.name} ${quantity}${i.unit}`,
      cutStyle,
      addOrder: n + 1,
    })),
    steps: [{ phase: 'cook', text: '内鍋に入れて加熱する' }],
  }
}

beforeEach(async () => {
  api = createTestApi()
  const make = async (body: Record<string, unknown>) => (await api.call<Ingredient>('POST', '/ingredients', body)).body
  const onion = await make({ ...base, name: '玉ねぎ', category: 'vegetable', unit: '個', preppedFridgeDays: 3 })
  const potato = await make({
    ...base,
    name: 'じゃがいも',
    category: 'vegetable',
    unit: '個',
    canFreeze: false,
    freezerDays: null,
    preppedFridgeDays: 1,
  })
  const pork = await make({ ...base, name: '豚こま切れ肉', category: 'meat', unit: 'g', preppedFridgeDays: 2 })
  const tofu = await make({
    ...base,
    name: '木綿豆腐',
    category: 'tofu_egg_dairy',
    unit: '丁',
    canFreeze: false,
    freezerDays: null,
    beforeCookTask: '2cm角に切る',
  })
  // 1 日目: じゃがいもは切った後 1 日なので冷蔵
  nikujaga = (
    await api.call<Recipe>(
      'POST',
      '/recipes',
      recipe('肉じゃが', [
        [onion, 1, 'くし形切り'],
        [potato, 1, '乱切り'],
        [pork, 100, null],
      ]),
    )
  ).body
  // 2 日目: じゃがいもがあるので冷凍。冷凍できないじゃがいもと、直前作業のある豆腐は袋に入れない
  nimono = (
    await api.call<Recipe>(
      'POST',
      '/recipes',
      recipe('豆腐と豚の煮物', [
        [tofu, 1, null],
        [pork, 100, '一口大'],
        [onion, 0.5, '薄切り'],
        [potato, 1, '乱切り'],
      ]),
    )
  ).body
})

/** 献立を確定し、買い物リストを全部チェックして買い物完了まで進める */
async function prepping(): Promise<Plan> {
  const plan = (await api.call<Plan>('POST', '/plans', { anchors: [{ recipeId: nikujaga.id }] })).body
  await api.call('PUT', `/plans/${plan.id}/recipes`, {
    recipes: [
      { recipeId: nikujaga.id, role: 'anchor', servings: 1, dayIndex: 1 },
      { recipeId: nimono.id, role: 'added', servings: 1, dayIndex: 2 },
    ],
  })
  await api.call('POST', `/plans/${plan.id}/confirm`, { startsOn: tomorrow })
  const list = (await api.call<ShoppingList>('GET', `/plans/${plan.id}/shopping`)).body
  for (const item of list.items) await api.call('POST', `/shopping-items/${item.id}/check`)
  return (await api.call<Plan>('POST', `/plans/${plan.id}/shopping/complete`)).body
}

describe('下ごしらえ・袋詰め', () => {
  it('下ごしらえ: 今切るものを食材ごとに、切らずに残すもの・そのまま袋へを別に', async () => {
    const plan = await prepping()
    const res = await api.call<PrepView>('GET', `/plans/${plan.id}/prep`)
    expect(res.status).toBe(200)
    const { prep, kits, shortages } = res.body
    expect(kits.map((k) => [k.title, k.plannedOn, k.location])).toEqual([
      ['肉じゃが', tomorrow, 'fridge'],
      ['豆腐と豚の煮物', addDays(today, 2), 'freezer'],
    ])
    expect(
      prep.cutNow.map((c) => [c.name, c.totalQuantity, c.uses.map((u) => `${u.recipeTitle}:${u.cutStyle}`)]),
    ).toEqual([
      ['じゃがいも', 1, ['肉じゃが:乱切り']],
      ['玉ねぎ', 1.5, ['肉じゃが:くし形切り', '豆腐と豚の煮物:薄切り']],
      ['豚こま切れ肉', 100, ['豆腐と豚の煮物:一口大']],
    ])
    expect(prep.keepWhole.map((k) => [k.name, k.recipeTitle, k.task])).toEqual([
      ['じゃがいも', '豆腐と豚の煮物', '冷凍できないので直前に切る（乱切り）'],
      ['木綿豆腐', '豆腐と豚の煮物', '2cm角に切る'],
    ])
    expect(prep.asIs.map((a) => [a.name, a.quantity])).toEqual([['豚こま切れ肉', 100]])
    expect(shortages).toEqual([])
  })

  it('袋詰めの下書きは保存場所を変えて計算し直せる', async () => {
    const plan = await prepping()
    const res = await api.call<PrepView>('POST', `/plans/${plan.id}/kits/preview`, {
      kits: [{ recipeId: nimono.id, location: 'fridge' }],
    })
    const kit = res.body.kits.find((k) => k.recipeId === nimono.id)
    expect(kit?.location).toBe('fridge')
    expect(kit?.defaultLocation).toBe('freezer')
    // 冷蔵ならじゃがいもも袋へ。ただし切った後 1 日しか持たないので注意
    expect(kit?.items.find((i) => i.name === 'じゃがいも')?.state).toBe('packed')
    expect(kit?.warnings[0]).toMatch(/冷蔵だと使用期限/)
  })

  it('袋を保存すると在庫を減らし、直前作業の分は確保として残る。献立は stored', async () => {
    const plan = await prepping()
    const res = await api.call<{ kits: unknown[] }>('POST', `/plans/${plan.id}/kits`, {})
    expect(res.status).toBe(201)
    expect(res.body.kits).toHaveLength(2)

    const stock = (await api.call<{ items: InventoryItem[] }>('GET', '/inventory')).body.items
    expect(stock.map((i) => [i.name, i.quantity, i.reservedQuantity, i.reservedFor]).sort()).toEqual([
      ['じゃがいも', 1, 1, ['豆腐と豚の煮物']],
      ['木綿豆腐', 1, 1, ['豆腐と豚の煮物']],
    ])

    const fridge = (await api.call<{ items: FridgeEntry[] }>('GET', '/fridge?kind=meal_kit')).body.items
    expect(fridge.map((e) => [e.name, e.location, e.plannedOn])).toEqual([
      ['肉じゃが', 'fridge', tomorrow],
      ['豆腐と豚の煮物', 'freezer', addDays(today, 2)],
    ])

    expect((await api.call<Plan>('GET', `/plans/${plan.id}`)).body.status).toBe('stored')
    expect((await api.call<{ plan: Plan | null }>('GET', '/plans/current')).body.plan).toBeNull()
    // 2 回目は 409
    expect((await api.call('POST', `/plans/${plan.id}/kits`, {})).status).toBe(409)
  })

  it('袋の保存が同時に 2 本届いても、袋は料理の数だけで在庫も 1 回分だけ減る', async () => {
    const plan = await prepping()
    const [a, b] = await Promise.all([
      api.call('POST', `/plans/${plan.id}/kits`, {}),
      api.call('POST', `/plans/${plan.id}/kits`, {}),
    ])
    expect([a.status, b.status].sort()).toEqual([201, 409])
    const fridge = (await api.call<{ items: FridgeEntry[] }>('GET', '/fridge?kind=meal_kit')).body.items
    expect(fridge).toHaveLength(2)
    const stock = (await api.call<{ items: InventoryItem[] }>('GET', '/inventory')).body.items
    expect(stock.map((i) => [i.name, i.quantity]).sort()).toEqual([
      ['じゃがいも', 1],
      ['木綿豆腐', 1],
    ])
  })

  it('在庫が足りない分は下書きで知らせる', async () => {
    const plan = await prepping()
    const onionRow = (await api.call<{ items: InventoryItem[] }>('GET', '/inventory')).body.items.find(
      (i) => i.name === '玉ねぎ',
    )
    await api.call('POST', `/inventory/${onionRow?.id}/use-up`)
    const res = await api.call<PrepView>('GET', `/plans/${plan.id}/prep`)
    expect(res.body.shortages).toEqual([expect.objectContaining({ name: '玉ねぎ', quantity: 1.5, kind: 'pack' })])
    // 直前に使う豆腐（確保する分）がないときも知らせる
    const tofuRow = (await api.call<{ items: InventoryItem[] }>('GET', '/inventory')).body.items.find(
      (i) => i.name === '木綿豆腐',
    )
    await api.call('POST', `/inventory/${tofuRow?.id}/use-up`)
    const again = await api.call<PrepView>('GET', `/plans/${plan.id}/prep`)
    expect(again.body.shortages).toContainEqual(expect.objectContaining({ name: '木綿豆腐', kind: 'before_cook' }))
  })

  it('下ごしらえ中でなければ 409、献立にない料理は 400', async () => {
    const plan = (await api.call<Plan>('POST', '/plans', { anchors: [{ recipeId: nikujaga.id }] })).body
    expect((await api.call('GET', `/plans/${plan.id}/prep`)).status).toBe(409)
    await api.call('DELETE', `/plans/${plan.id}`)

    const p2 = await prepping()
    const res = await api.call('POST', `/plans/${p2.id}/kits`, { kits: [{ recipeId: 'nope', location: 'fridge' }] })
    expect(res.status).toBe(400)
  })
})
