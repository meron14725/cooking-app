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

// ---------- 保存中の袋と調理（S08） ----------

export const KIT_STATUS_VALUES = ['stored', 'cooked', 'discarded'] as const
export type KitStatus = (typeof KIT_STATUS_VALUES)[number]

export const kitListQuerySchema = z.object({
  status: z.enum(KIT_STATUS_VALUES).optional(),
  /** この日までに食べる予定の袋（今日の袋 = 今日の日付） */
  plannedOnOrBefore: z.iso.date().optional(),
})

export const kitPatchSchema = z
  .object({
    location: kitLocationSchema.optional(),
    useBy: z.iso.date('日付は YYYY-MM-DD で入れてください').optional(),
  })
  .refine((v) => v.location !== undefined || v.useBy !== undefined, { message: '変更する項目を指定してください' })
export type KitPatchInput = z.infer<typeof kitPatchSchema>

export const kitCookedSchema = z.object({
  /** 余りの量の修正（直前作業で使った食材の在庫行）。0 で使い切り */
  leftovers: z
    .array(z.object({ inventoryItemId: z.string().min(1), quantity: z.number().min(0).max(100_000) }))
    .max(30)
    .default([]),
})
export type KitCookedInput = z.infer<typeof kitCookedSchema>

export type MealKit = {
  id: string
  planId: string
  recipeId: string
  title: string
  servings: number
  location: 'fridge' | 'freezer'
  packedOn: string
  plannedOn: string
  useBy: string
  status: KitStatus
  daysLeft: number
  expiryStatus: 'expired' | 'soon' | 'ok'
  items: {
    ingredientId: string
    name: string
    unit: string
    quantity: number | null
    state: 'packed' | 'before_cook' | 'seasoning_packed'
    beforeCookTask: string | null
  }[]
}

/** 調理画面の「入れる順」の 1 行。from = どこから入れるか */
export type CookAddStep = {
  ingredientId: string
  name: string
  /** レシピの表記（元の人数分） */
  displayText: string
  /** 袋の食数に合わせた量。NULL = 少々・適量 */
  quantity: number | null
  unit: string
  from: 'kit' | 'before_cook' | 'now'
}

export type CookView = {
  kit: MealKit
  hotcookMode: string | null
  beforeCook: { ingredientId: string; name: string; unit: string; quantity: number | null; task: string }[]
  addOrder: CookAddStep[]
  cookSteps: string[]
  /** 冷凍のまま入れるときの注意 */
  frozenNotes: string[]
  notes: string | null
  /** 作った後に残る見込みの在庫（直前作業で使った食材）。画面で直して送る */
  expectedLeftovers: { inventoryItemId: string; name: string; unit: string; quantity: number }[]
}
