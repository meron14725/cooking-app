import { beforeEach, describe, expect, it } from 'vitest'
import type { Ingredient, IngredientInput } from '../../shared/schemas/ingredient'
import { createTestApi } from '../testing/app'

const onion: IngredientInput = {
  name: '玉ねぎ',
  aliases: ['たまねぎ', 'タマネギ'],
  category: 'vegetable',
  unit: '個',
  gramsPerUnit: 200,
  canFreeze: true,
  fridgeDays: 60,
  freezerDays: 30,
  pantryDays: 30,
  defaultLocation: 'pantry',
  packageUnits: [
    { label: '1個', quantity: 1 },
    { label: '3個入り', quantity: 3, isDefault: true },
  ],
}

let api: ReturnType<typeof createTestApi>

beforeEach(() => {
  api = createTestApi()
})

describe('食材マスタ API', () => {
  it('作成して取得できる。代表の販売単位は 1 つ', async () => {
    const created = await api.call<Ingredient>('POST', '/ingredients', onion)
    expect(created.status).toBe(201)
    expect(created.body.name).toBe('玉ねぎ')
    expect(created.body.aliases).toEqual(['たまねぎ', 'タマネギ'])
    expect(created.body.packageUnits.map((u) => [u.label, u.isDefault])).toEqual([
      ['1個', false],
      ['3個入り', true],
    ])

    const got = await api.call<Ingredient>('GET', `/ingredients/${created.body.id}`)
    expect(got.body).toEqual(created.body)
  })

  it('代表の指定がなければ先頭を代表にする', async () => {
    const res = await api.call<Ingredient>('POST', '/ingredients', {
      ...onion,
      packageUnits: [
        { label: '1個', quantity: 1 },
        { label: '3個入り', quantity: 3 },
      ],
    })
    expect(res.body.packageUnits.filter((u) => u.isDefault).map((u) => u.label)).toEqual(['1個'])
  })

  it('代表を 2 つ指定すると 400', async () => {
    const res = await api.call<{ error: { code: string } }>('POST', '/ingredients', {
      ...onion,
      packageUnits: [
        { label: '1個', quantity: 1, isDefault: true },
        { label: '3個入り', quantity: 3, isDefault: true },
      ],
    })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('冷凍できないのに冷凍の日持ちがあると 400', async () => {
    const res = await api.call('POST', '/ingredients', { ...onion, canFreeze: false })
    expect(res.status).toBe(400)
  })

  it('同じ名前は 409', async () => {
    await api.call('POST', '/ingredients', onion)
    const res = await api.call<{ error: { code: string } }>('POST', '/ingredients', onion)
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('DUPLICATE_NAME')
  })

  it('一覧は名前と別名で検索でき、区分で絞り込める', async () => {
    await api.call('POST', '/ingredients', onion)
    await api.call('POST', '/ingredients', {
      ...onion,
      name: '豚こま',
      aliases: ['豚こま切れ肉'],
      category: 'meat',
      unit: 'g',
      gramsPerUnit: null,
      packageUnits: [{ label: '200g', quantity: 200 }],
    })
    const byAlias = await api.call<{ items: Ingredient[] }>('GET', `/ingredients?q=${encodeURIComponent('タマネギ')}`)
    expect(byAlias.body.items.map((i) => i.name)).toEqual(['玉ねぎ'])
    const byCategory = await api.call<{ items: Ingredient[] }>('GET', '/ingredients?category=meat')
    expect(byCategory.body.items.map((i) => i.name)).toEqual(['豚こま'])
    const all = await api.call<{ items: Ingredient[] }>('GET', '/ingredients')
    expect(all.body.items).toHaveLength(2)
  })

  it('更新: 販売単位は id があれば更新、なければ追加、送らなければ削除', async () => {
    const { body: created } = await api.call<Ingredient>('POST', '/ingredients', onion)
    const single = created.packageUnits.find((u) => u.label === '1個')
    if (!single) throw new Error('1個 がない')

    const res = await api.call<Ingredient>('PUT', `/ingredients/${created.id}`, {
      ...onion,
      fridgeDays: 45,
      packageUnits: [
        { id: single.id, label: 'バラ1個', quantity: 1, isDefault: true },
        { label: '5個入り', quantity: 5 },
      ],
    })
    expect(res.status).toBe(200)
    expect(res.body.fridgeDays).toBe(45)
    expect(res.body.packageUnits.map((u) => [u.label, u.isDefault])).toEqual([
      ['バラ1個', true],
      ['5個入り', false],
    ])
    // id を指定した販売単位は同じ id のまま
    expect(res.body.packageUnits[0]?.id).toBe(single.id)
  })

  it('更新で販売単位を空にできる', async () => {
    const { body: created } = await api.call<Ingredient>('POST', '/ingredients', onion)
    const res = await api.call<Ingredient>('PUT', `/ingredients/${created.id}`, { ...onion, packageUnits: [] })
    expect(res.body.packageUnits).toEqual([])
  })

  it('削除は論理削除。一覧と取得から消え、同じ名前では作れない', async () => {
    const { body: created } = await api.call<Ingredient>('POST', '/ingredients', onion)
    const del = await api.call('DELETE', `/ingredients/${created.id}`)
    expect(del.status).toBe(204)
    expect((await api.call('GET', `/ingredients/${created.id}`)).status).toBe(404)
    expect((await api.call<{ items: Ingredient[] }>('GET', '/ingredients')).body.items).toEqual([])
    const again = await api.call<{ error: { message: string } }>('POST', '/ingredients', onion)
    expect(again.status).toBe(409)
    expect(again.body.error.message).toContain('削除済み')
  })

  it('存在しない食材は 404', async () => {
    expect((await api.call('GET', '/ingredients/nope')).status).toBe(404)
    expect((await api.call('PUT', '/ingredients/nope', onion)).status).toBe(404)
  })
})
