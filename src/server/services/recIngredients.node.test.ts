import { describe, expect, it } from 'vitest'
import type { Ingredient } from '../../shared/schemas/ingredient'
import { createDb } from '../db/client'
import { createTestApi } from '../testing/app'
import { loadRecIngredients } from './recIngredients'

describe('loadRecIngredients', () => {
  it('削除済みの食材も返し、archived を付ける', async () => {
    const api = createTestApi()
    const base = { category: 'vegetable', unit: '個', canFreeze: true, fridgeDays: 3, defaultLocation: 'fridge' }
    const { body: onion } = await api.call<Ingredient>('POST', '/ingredients', {
      ...base,
      name: '玉ねぎ',
      priceYen: 50,
    })
    const { body: old } = await api.call<Ingredient>('POST', '/ingredients', {
      ...base,
      name: '古い玉ねぎ',
      priceYen: 900,
    })
    await api.call('DELETE', `/ingredients/${old.id}`)

    const map = await loadRecIngredients(createDb(api.env.DB))
    expect(map.get(onion.id)).toMatchObject({ archived: false, priceYen: 50 })
    expect(map.get(old.id)).toMatchObject({ archived: true, priceYen: 900 })
  })
})
