import { z } from 'zod'

export const RECIPE_SOURCE_TYPES = ['manual', 'url', 'ai', 'seed'] as const
export const STEP_PHASES = ['prep', 'cook'] as const

export const recipeSourceTypeSchema = z.enum(RECIPE_SOURCE_TYPES)
export const stepPhaseSchema = z.enum(STEP_PHASES)

export type RecipeSourceType = z.infer<typeof recipeSourceTypeSchema>
export type StepPhase = z.infer<typeof stepPhaseSchema>

export const SOURCE_TYPE_LABELS: Record<RecipeSourceType, string> = {
  manual: '手登録',
  url: 'URL取り込み',
  ai: 'AI提案',
  seed: '初期データ',
}

export const STEP_PHASE_LABELS: Record<StepPhase, string> = {
  prep: '下ごしらえ',
  cook: '調理',
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null))

export const recipeIngredientInputSchema = z.object({
  ingredientId: z.string().min(1, '食材を選んでください'),
  /** 基準単位、recipe.servings 人前の量。null = 少々・適量 */
  quantity: z
    .number()
    .min(0)
    .nullish()
    .transform((v) => v ?? null),
  /** 「玉ねぎ 1/2個」のような表示用の文字列 */
  displayText: z.string().trim().min(1, '表示用の文字列を入れてください').max(100),
  /** 切り方。null = 切らない */
  cutStyle: optionalText(50),
  /** ホットクックに入れる順（0 = 指定なし） */
  addOrder: z.number().int().min(0).max(99).default(0),
})

export const recipeStepInputSchema = z.object({
  phase: stepPhaseSchema,
  text: z.string().trim().min(1, '手順を入れてください').max(500),
})

export const recipeInputSchema = z.object({
  title: z.string().trim().min(1, '料理名を入れてください').max(100),
  servings: z.number().positive('人数は 0 より大きくしてください').max(20),
  caloriesKcal: z
    .number()
    .int()
    .min(0)
    .max(5000)
    .nullish()
    .transform((v) => v ?? null),
  caloriesEstimated: z.boolean().default(false),
  hotcookMode: optionalText(100),
  maxServings1_6l: z
    .number()
    .positive()
    .max(20)
    .nullish()
    .transform((v) => v ?? null),
  packSeasonings: z.boolean().default(false),
  /** 作成時だけ使う。更新では変えない。seed はマイグレーションだけが入れる */
  sourceType: z.enum(['manual', 'url', 'ai']).default('manual'),
  sourceUrl: z
    .url('URL の形式が正しくありません')
    .max(2000)
    .nullish()
    .or(z.literal(''))
    .transform((v) => (v ? v : null)),
  notes: optionalText(2000),
  ingredients: z.array(recipeIngredientInputSchema).min(1, '材料を 1 つ以上入れてください').max(50),
  steps: z.array(recipeStepInputSchema).max(50).default([]),
})

export type RecipeInput = z.input<typeof recipeInputSchema>
export type RecipeInputParsed = z.output<typeof recipeInputSchema>

export type RecipeIngredient = {
  id: string
  ingredientId: string
  /** 食材マスタの名前と基準単位（マスタ側で削除済みでも出す） */
  ingredientName: string
  unit: string
  quantity: number | null
  displayText: string
  cutStyle: string | null
  addOrder: number
}

export type RecipeStep = {
  id: string
  stepNo: number
  phase: StepPhase
  text: string
}

export type Recipe = {
  id: string
  title: string
  servings: number
  caloriesKcal: number | null
  caloriesEstimated: boolean
  hotcookMode: string | null
  maxServings1_6l: number | null
  packSeasonings: boolean
  sourceType: RecipeSourceType
  sourceUrl: string | null
  notes: string | null
  ingredients: RecipeIngredient[]
  steps: RecipeStep[]
  updatedAt: string
}

export type RecipeSummary = Pick<
  Recipe,
  'id' | 'title' | 'servings' | 'caloriesKcal' | 'caloriesEstimated' | 'hotcookMode' | 'sourceType'
> & {
  /** 材料の食材名（並び順どおり、重複なし） */
  ingredientNames: string[]
}
