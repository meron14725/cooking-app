import { z } from 'zod'

/** 売り場の区分（買い物リストの並び順もこの順） */
export const CATEGORY_OPTIONS = [
  { value: 'vegetable', label: '野菜' },
  { value: 'meat', label: '肉' },
  { value: 'fish', label: '魚' },
  { value: 'tofu_egg_dairy', label: '豆腐・卵・乳製品' },
  { value: 'dry', label: '乾物・缶詰' },
  { value: 'seasoning', label: '調味料' },
  { value: 'other', label: 'その他' },
] as const

export const LOCATION_OPTIONS = [
  { value: 'fridge', label: '冷蔵' },
  { value: 'freezer', label: '冷凍' },
  { value: 'pantry', label: '常温' },
] as const

export const categorySchema = z.enum(['vegetable', 'meat', 'fish', 'tofu_egg_dairy', 'seasoning', 'dry', 'other'])
export const storageLocationSchema = z.enum(['fridge', 'freezer', 'pantry'])

export type Category = z.infer<typeof categorySchema>
export type StorageLocation = z.infer<typeof storageLocationSchema>

export function categoryLabel(value: Category): string {
  return CATEGORY_OPTIONS.find((o) => o.value === value)?.label ?? value
}

export function locationLabel(value: StorageLocation): string {
  return LOCATION_OPTIONS.find((o) => o.value === value)?.label ?? value
}

const days = z.number().int().min(0).max(3650)
const optionalText = z
  .string()
  .trim()
  .max(200)
  .nullish()
  .transform((v) => (v ? v : null))

export const packageUnitInputSchema = z.object({
  /** 更新時、既存の販売単位を指す。新しく足すときは省略 */
  id: z.string().optional(),
  /** 例: 3個入り */
  label: z.string().trim().min(1, '販売単位の名前を入れてください').max(50),
  /** 基準単位での量 */
  quantity: z.number().positive('量は 0 より大きくしてください'),
  isDefault: z.boolean().default(false),
})

export const ingredientInputSchema = z
  .object({
    name: z.string().trim().min(1, '名前を入れてください').max(50),
    aliases: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
    category: categorySchema,
    unit: z.string().trim().min(1, '単位を入れてください').max(10),
    gramsPerUnit: z
      .number()
      .positive()
      .nullish()
      .transform((v) => v ?? null),
    canFreeze: z.boolean(),
    fridgeDays: days,
    freezerDays: days.nullish().transform((v) => v ?? null),
    pantryDays: days.nullish().transform((v) => v ?? null),
    preppedFridgeDays: days.nullish().transform((v) => v ?? null),
    preppedFreezerDays: days.nullish().transform((v) => v ?? null),
    defaultLocation: storageLocationSchema,
    beforeCookTask: optionalText,
    frozenCookNote: optionalText,
    isStaple: z.boolean().default(false),
    packageUnits: z.array(packageUnitInputSchema).max(10).default([]),
  })
  .superRefine((v, ctx) => {
    if (!v.canFreeze && v.freezerDays !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['freezerDays'],
        message: '冷凍できない食材には冷凍の日持ちを入れられません',
      })
    }
    if (!v.canFreeze && v.defaultLocation === 'freezer') {
      ctx.addIssue({ code: 'custom', path: ['defaultLocation'], message: '冷凍できない食材は冷凍保存にできません' })
    }
    if (v.packageUnits.filter((p) => p.isDefault).length > 1) {
      ctx.addIssue({ code: 'custom', path: ['packageUnits'], message: '代表の販売単位は 1 つだけにしてください' })
    }
  })

export type IngredientInput = z.input<typeof ingredientInputSchema>
export type IngredientInputParsed = z.output<typeof ingredientInputSchema>

export type PackageUnit = {
  id: string
  label: string
  quantity: number
  isDefault: boolean
}

export type Ingredient = {
  id: string
  name: string
  aliases: string[]
  category: Category
  unit: string
  gramsPerUnit: number | null
  canFreeze: boolean
  fridgeDays: number
  freezerDays: number | null
  pantryDays: number | null
  preppedFridgeDays: number | null
  preppedFreezerDays: number | null
  defaultLocation: StorageLocation
  beforeCookTask: string | null
  frozenCookNote: string | null
  isStaple: boolean
  packageUnits: PackageUnit[]
}
