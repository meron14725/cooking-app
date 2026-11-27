import { z } from 'zod'
import type { KitDraft, PrepSummary } from '../domain/prep'

export const kitLocationSchema = z.enum(['fridge', 'freezer'])

/** 袋の保存場所の指定。省略した料理は初期値（食べる日から決まる） */
export const kitsInputSchema = z.object({
  kits: z
    .array(z.object({ recipeId: z.string().min(1), location: kitLocationSchema }))
    .max(10)
    .refine((list) => new Set(list.map((k) => k.recipeId)).size === list.length, '同じ料理が重なっています')
    .default([]),
})
export type KitsInput = z.infer<typeof kitsInputSchema>

/** 在庫が足りない量。pack = 袋に入れる分、before_cook = 直前に使う分（袋用に確保する分） */
export type Shortage = {
  ingredientId: string
  name: string
  unit: string
  quantity: number
  kind: 'pack' | 'before_cook'
}

export type PrepView = { kits: KitDraft[]; prep: PrepSummary; shortages: Shortage[] }
