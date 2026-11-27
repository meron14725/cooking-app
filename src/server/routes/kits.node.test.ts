import { beforeEach, describe, expect, it } from 'vitest'
import { addDays, todayJst } from '../../shared/domain/date'
import type { Ingredient, IngredientInput } from '../../shared/schemas/ingredient'
import type { FridgeEntry, InventoryItem } from '../../shared/schemas/inventory'
import type { CookView, MealKit, PrepView } from '../../shared/schemas/kit'
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

/** 袋を保存したところまで進める */
async function stored(): Promise<{ plan: Plan; kits: MealKit[] }> {
  const plan = await prepping()
  await api.call('POST', `/plans/${plan.id}/kits`, {})
  const kits = (await api.call<{ items: MealKit[] }>('GET', '/kits')).body.items
  return { plan, kits }
}

const stock = async () => (await api.call<{ items: InventoryItem[] }>('GET', '/inventory')).body.items
const kitOf = (kits: MealKit[], title: string) => kits.find((k) => k.title === title) as MealKit

describe('保存中の袋と調理', () => {
  it('一覧は食べる日順。今日の袋は plannedOnOrBefore で絞れる', async () => {
    const { kits } = await stored()
    expect(kits.map((k) => [k.title, k.plannedOn, k.status])).toEqual([
      ['肉じゃが', tomorrow, 'stored'],
      ['豆腐と豚の煮物', addDays(today, 2), 'stored'],
    ])
    const due = (await api.call<{ items: MealKit[] }>('GET', `/kits?plannedOnOrBefore=${tomorrow}`)).body.items
    expect(due.map((k) => k.title)).toEqual(['肉じゃが'])
  })

  it('調理画面: 直前作業、入れる順（袋 / 直前 / いま入れる）、冷凍の注意、余りの見込み', async () => {
    const { kits } = await stored()
    const view = (await api.call<CookView>('GET', `/kits/${kitOf(kits, '豆腐と豚の煮物').id}/cook`)).body
    expect(view.beforeCook.map((b) => [b.name, b.task])).toEqual([
      ['木綿豆腐', '2cm角に切る'],
      ['じゃがいも', '冷凍できないので直前に切る（乱切り）'],
    ])
    expect(view.addOrder.map((a) => [a.name, a.quantity, a.from])).toEqual([
      ['木綿豆腐', 1, 'before_cook'],
      ['豚こま切れ肉', 100, 'kit'],
      ['玉ねぎ', 0.5, 'kit'],
      ['じゃがいも', 1, 'before_cook'],
    ])
    expect(view.cookSteps).toEqual(['内鍋に入れて加熱する'])
    expect(view.frozenNotes.length).toBeGreaterThan(0)
    expect(view.expectedLeftovers.map((l) => [l.name, l.quantity]).sort()).toEqual([
      ['じゃがいも', 0],
      ['木綿豆腐', 0],
    ])
    const fridgeKit = (await api.call<CookView>('GET', `/kits/${kitOf(kits, '肉じゃが').id}/cook`)).body
    expect(fridgeKit.frozenNotes).toEqual([])
    expect(fridgeKit.beforeCook).toEqual([])
  })

  it('作った: 直前に使った分を減らし、余りの修正を反映。全部作ると献立は done', async () => {
    const { plan, kits } = await stored()
    const nimonoKit = kitOf(kits, '豆腐と豚の煮物')
    const view = (await api.call<CookView>('GET', `/kits/${nimonoKit.id}/cook`)).body
    const potatoRow = view.expectedLeftovers.find((l) => l.name === 'じゃがいも')
    const res = await api.call<MealKit>('POST', `/kits/${nimonoKit.id}/cooked`, {
      leftovers: [{ inventoryItemId: potatoRow?.inventoryItemId, quantity: 0.3 }],
    })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('cooked')
    expect((await stock()).map((i) => [i.name, i.quantity, i.reservedQuantity])).toEqual([['じゃがいも', 0.3, 0]])
    expect((await api.call<Plan>('GET', `/plans/${plan.id}`)).body.status).toBe('stored')

    expect((await api.call('POST', `/kits/${kitOf(kits, '肉じゃが').id}/cooked`, {})).status).toBe(200)
    expect((await api.call<Plan>('GET', `/plans/${plan.id}`)).body.status).toBe('done')
    expect((await api.call<{ items: MealKit[] }>('GET', '/kits')).body.items).toEqual([])
    expect((await api.call('POST', `/kits/${nimonoKit.id}/cooked`, {})).status).toBe(409)
  })

  it('作ったが同時に何本届いても、在庫は 1 回分だけ減る', async () => {
    const { kits } = await stored()
    const id = kitOf(kits, '豆腐と豚の煮物').id
    // じゃがいもを 2 個足しておく（直前に 1 個使うと 2 個残る。二重に減ると 1 個になる）
    const potato = (await stock()).find((i) => i.name === 'じゃがいも')
    await api.call('POST', '/inventory', { ingredientId: potato?.ingredientId, quantity: 2 })
    const results = await Promise.all(Array.from({ length: 3 }, () => api.call('POST', `/kits/${id}/cooked`, {})))
    expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409])
    const left = (await stock()).filter((i) => i.name === 'じゃがいも')
    expect(left.reduce((sum, i) => sum + i.quantity, 0)).toBe(2)
  })

  it('捨てた: 在庫は減らさず、確保が外れる', async () => {
    const { kits } = await stored()
    const res = await api.call<MealKit>('POST', `/kits/${kitOf(kits, '豆腐と豚の煮物').id}/discard`)
    expect(res.body.status).toBe('discarded')
    expect((await stock()).map((i) => [i.name, i.quantity, i.reservedQuantity]).sort()).toEqual([
      ['じゃがいも', 1, 0],
      ['木綿豆腐', 1, 0],
    ])
  })

  it('保存場所を変えると使用期限を計算し直す', async () => {
    const { kits } = await stored()
    const kit = kitOf(kits, '豆腐と豚の煮物')
    const res = await api.call<MealKit>('PATCH', `/kits/${kit.id}`, { location: 'fridge' })
    // 袋に入っているのは豚（切った後 2 日）と玉ねぎ（3 日）
    expect(res.body).toMatchObject({ location: 'fridge', useBy: addDays(today, 2) })
    const fixed = await api.call<MealKit>('PATCH', `/kits/${kit.id}`, { useBy: addDays(today, 1) })
    expect(fixed.body.useBy).toBe(addDays(today, 1))
  })
})
