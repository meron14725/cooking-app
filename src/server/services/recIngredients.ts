import { asc } from 'drizzle-orm'
import type { RecIngredient } from '../../shared/domain/recommend'
import type { Db } from '../db/client'
import { ingredients, packageUnits } from '../db/schema'

/** 食材マスタ（削除済みも含む。レシピから参照されていることがあるため）と販売単位（登録順） */
export async function loadRecIngredients(db: Db): Promise<Map<string, RecIngredient>> {
  const [rows, units] = await Promise.all([
    db.select().from(ingredients),
    db.select().from(packageUnits).orderBy(asc(packageUnits.createdAt), asc(packageUnits.id)),
  ])
  return new Map(
    rows.map((r) => [
      r.id,
      {
        id: r.id,
        name: r.name,
        unit: r.unit,
        isStaple: r.isStaple,
        category: r.category,
        gramsPerUnit: r.gramsPerUnit,
        canFreeze: r.canFreeze,
        pantryDays: r.pantryDays,
        preppedFridgeDays: r.preppedFridgeDays,
        priceYen: r.priceYen,
        packageUnits: units
          .filter((u) => u.ingredientId === r.id)
          .map((u) => ({ id: u.id, label: u.label, quantity: u.quantity, isDefault: u.isDefault })),
      },
    ]),
  )
}
