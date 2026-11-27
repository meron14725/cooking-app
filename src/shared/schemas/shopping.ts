import { z } from 'zod'
import { MAX_PRICE_YEN } from '../domain/constants'
import type { ShoppingCost } from '../domain/cost'
import type { Category } from './ingredient'

const countSchema = z.number().int('個数は整数で入れてください').min(0).max(99)
const quantitySchema = z.number().positive('量は 0 より大きくしてください').max(100_000)

/** 手で行を足す。販売単位 × 個数、または量（基準単位）のどちらか */
export const shoppingAddSchema = z
  .object({
    ingredientId: z.string().min(1, '食材を選んでください'),
    packageUnitId: z.string().min(1).nullish(),
    packageCount: countSchema.min(1, '個数は 1 以上にしてください').optional(),
    quantity: quantitySchema.optional(),
  })
  .refine((v) => Boolean(v.packageUnitId) || v.quantity !== undefined, {
    message: '販売単位か量を入れてください',
    path: ['quantity'],
  })
export type ShoppingAddInput = z.infer<typeof shoppingAddSchema>

/** 実際に違うパックを買ったときの修正。packageUnitId: null で量り売り（quantity で量を指定） */
export const shoppingPatchSchema = z
  .object({
    packageUnitId: z.string().min(1).nullable().optional(),
    packageCount: countSchema.optional(),
    quantity: quantitySchema.optional(),
  })
  .refine((v) => v.packageUnitId !== undefined || v.packageCount !== undefined || v.quantity !== undefined, {
    message: '変更する項目を指定してください',
  })
export type ShoppingPatchInput = z.infer<typeof shoppingPatchSchema>

/** 払った金額。null で消す */
export const shoppingPaidSchema = z.object({
  paidYen: z
    .number()
    .int('金額は整数で入れてください')
    .min(0, '金額は 0 以上にしてください')
    .max(MAX_PRICE_YEN)
    .nullable(),
})
export type ShoppingPaidInput = z.infer<typeof shoppingPaidSchema>

export type ShoppingItem = {
  id: string
  ingredientId: string
  name: string
  unit: string
  category: Category
  /** 不足量（基準単位）。手で足した行は 0 */
  needQuantity: number
  packageUnitId: string | null
  packageLabel: string | null
  packageCount: number
  /** 買う量（基準単位） */
  buyQuantity: number
  checkedAt: string | null
  isManual: boolean
  /** この食材を使う献立の料理 */
  usedFor: string[]
  /** この行の推定金額（10 円単位）。価格未設定・常備品は null */
  estimatedYen: number | null
  /** 販売単位の選択肢（修正用） */
  packageUnits: { id: string; label: string; quantity: number }[]
  /** 実際に払った金額（円）。未入力は null */
  paidYen: number | null
}

export type ShoppingList = {
  planId: string
  items: ShoppingItem[]
  /** 推定金額（docs/design/10-cost.md） */
  cost: ShoppingCost
}
