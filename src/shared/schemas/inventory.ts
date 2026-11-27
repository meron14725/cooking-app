import { z } from 'zod'
import type { ExpiryStatus } from '../domain/expiry'
import { type Category, type StorageLocation, storageLocationSchema } from './ingredient'

const dateSchema = z.iso.date('日付は YYYY-MM-DD で入れてください')

export const inventoryCreateSchema = z.object({
  ingredientId: z.string().min(1, '食材を選んでください'),
  /** 基準単位 */
  quantity: z.number().positive('量は 0 より大きくしてください').max(100_000),
  /** 省略時は食材マスタの既定の保存場所 */
  location: storageLocationSchema.optional(),
  /** 省略時は今日 */
  purchasedOn: dateSchema.optional(),
  /** 省略時は購入日 + 保存場所の日持ち */
  expiresOn: dateSchema.optional(),
})
export type InventoryCreateInput = z.infer<typeof inventoryCreateSchema>

export const inventoryPatchSchema = z
  .object({
    /** 0 にすると使い切り */
    quantity: z.number().min(0).max(100_000).optional(),
    /** 期限を指定せずに場所だけ変えると、購入日から期限を計算し直す */
    location: storageLocationSchema.optional(),
    expiresOn: dateSchema.optional(),
  })
  .refine((v) => v.quantity !== undefined || v.location !== undefined || v.expiresOn !== undefined, {
    message: '変更する項目を指定してください',
  })
export type InventoryPatchInput = z.infer<typeof inventoryPatchSchema>

export type InventorySource = 'shopping' | 'leftover' | 'manual'

export type InventoryItem = {
  id: string
  ingredientId: string
  name: string
  unit: string
  category: Category
  quantity: number
  location: StorageLocation
  purchasedOn: string
  expiresOn: string
  source: InventorySource
  daysLeft: number
  isExpiringSoon: boolean
  expiryStatus: ExpiryStatus
  /** stored の袋の直前作業用に確保している量（期限の近い行から割り当て） */
  reservedQuantity: number
  /** 確保している袋の料理名 */
  reservedFor: string[]
}

/** 冷蔵庫ビュー（S02）の 1 行。docs/design/04-api.md の GET /api/fridge */
export type FridgeEntry = {
  kind: 'ingredient' | 'meal_kit'
  id: string
  /** 食材名 or 料理名 */
  name: string
  quantityText: string | null
  location: StorageLocation
  expiresOn: string
  daysLeft: number
  isExpiringSoon: boolean
  expiryStatus: ExpiryStatus
  /** 食材のうち袋用に確保している分があれば「麻婆豆腐の袋用」 */
  reservedFor: string | null
  /** ミールキットの食べる予定日 */
  plannedOn: string | null
}

export const fridgeQuerySchema = z.object({
  location: storageLocationSchema.optional(),
  kind: z.enum(['ingredient', 'meal_kit']).optional(),
  /** true なら期限が近いもの（過ぎたものを含む）だけ */
  expiringSoon: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
})
