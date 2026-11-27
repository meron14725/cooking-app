/**
 * 袋用の確保（docs/design/02-data-model.md「在庫の動き」）。
 * 確保は食材ごとの量だけで持つので、どの在庫行の分かは「期限の近い行から」順に割り当てて決める
 * （袋詰め・調理で在庫を減らす順と同じ）。冷蔵庫ビューの「〇〇の袋用」表示に使う。
 */

export type StockRow = { id: string; ingredientId: string; quantity: number; expiresOn: string }

export type Reservation = {
  ingredientId: string
  quantity: number
  /** 何の袋用か（料理名） */
  label: string
}

export type RowReservation = { reservedQuantity: number; reservedFor: string[] }

const EPSILON = 1e-9

export function allocateReservations(rows: StockRow[], reservations: Reservation[]): Map<string, RowReservation> {
  const result = new Map<string, RowReservation>()
  const byIngredient = new Map<string, StockRow[]>()
  for (const r of rows) {
    const list = byIngredient.get(r.ingredientId) ?? []
    list.push(r)
    byIngredient.set(r.ingredientId, list)
  }
  for (const list of byIngredient.values()) {
    list.sort((a, b) => a.expiresOn.localeCompare(b.expiresOn) || a.id.localeCompare(b.id))
  }
  const remaining = new Map(rows.map((r) => [r.id, r.quantity]))

  for (const reservation of reservations) {
    let need = reservation.quantity
    for (const row of byIngredient.get(reservation.ingredientId) ?? []) {
      if (need <= EPSILON) break
      const left = remaining.get(row.id) ?? 0
      if (left <= EPSILON) continue
      const take = Math.min(left, need)
      remaining.set(row.id, left - take)
      need -= take
      const entry = result.get(row.id) ?? { reservedQuantity: 0, reservedFor: [] }
      entry.reservedQuantity = Math.round((entry.reservedQuantity + take) * 100) / 100
      if (!entry.reservedFor.includes(reservation.label)) entry.reservedFor.push(reservation.label)
      result.set(row.id, entry)
    }
  }
  return result
}
