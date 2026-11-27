import { describe, expect, it } from 'vitest'
import { allocateReservations } from './reservations'

const rows = [
  { id: 'late', ingredientId: 'tofu', quantity: 1, expiresOn: '2026-12-05' },
  { id: 'early', ingredientId: 'tofu', quantity: 1, expiresOn: '2026-11-30' },
  { id: 'onion', ingredientId: 'onion', quantity: 3, expiresOn: '2027-01-01' },
]

describe('allocateReservations', () => {
  it('期限の近い行から割り当てる', () => {
    const map = allocateReservations(rows, [{ ingredientId: 'tofu', quantity: 1, label: '麻婆豆腐' }])
    expect(map.get('early')).toEqual({ reservedQuantity: 1, reservedFor: ['麻婆豆腐'] })
    expect(map.has('late')).toBe(false)
  })

  it('1 行で足りなければ次の行にまたがる。複数の袋はそれぞれの名前が付く', () => {
    const map = allocateReservations(rows, [
      { ingredientId: 'tofu', quantity: 0.5, label: '麻婆豆腐' },
      { ingredientId: 'tofu', quantity: 1, label: '湯豆腐' },
      { ingredientId: 'onion', quantity: 0.5, label: '湯豆腐' },
    ])
    expect(map.get('early')).toEqual({ reservedQuantity: 1, reservedFor: ['麻婆豆腐', '湯豆腐'] })
    expect(map.get('late')).toEqual({ reservedQuantity: 0.5, reservedFor: ['湯豆腐'] })
    expect(map.get('onion')).toEqual({ reservedQuantity: 0.5, reservedFor: ['湯豆腐'] })
  })

  it('在庫より多い確保は、あるだけ割り当てる', () => {
    const map = allocateReservations(rows, [{ ingredientId: 'tofu', quantity: 5, label: '豆腐づくし' }])
    expect(map.get('early')?.reservedQuantity).toBe(1)
    expect(map.get('late')?.reservedQuantity).toBe(1)
  })
})
