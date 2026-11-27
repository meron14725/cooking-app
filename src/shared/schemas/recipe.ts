import { z } from 'zod'
import { isImageKey } from '../domain/images'

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

/** 取り込み元の件数（お気に入り数など）。省略したら更新で今の値を残す */
const optionalCount = z.number().int().min(0).nullish()

export const RECIPE_SORTS = ['popular', 'cooked'] as const
/** 一覧の並べ替え: popular = お気に入り数の多い順、cooked = 作られた回数の多い順、省略 = 料理名順 */
export const recipeSortSchema = z.enum(RECIPE_SORTS)
export type RecipeSort = z.infer<typeof recipeSortSchema>

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
  /**
   * 公式レシピの情報（URL 取り込みや利用者の UPDATE で入る）。
   * 省略（undefined）したら更新で今の値を残し、null なら消す
   */
  officialMenuNo: z
    .string()
    .regex(/^\d{3}$/, 'メニュー番号は 3 桁の数字です')
    .nullish(),
  imageKey: z.string().refine(isImageKey, '画像のキーは img/ の下のファイル名です').nullish(),
  favoriteCount: optionalCount,
  cookCount: optionalCount,
  score: optionalCount,
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
  /** 公式メニュー番号（3 桁）。ないレシピは null */
  officialMenuNo: string | null
  /** 完成写真の R2 キー（例: img/R4063.jpg）。画面では imagePath(key) で出す */
  imageKey: string | null
  favoriteCount: number | null
  /** 自分のお気に入り（PUT /api/recipes/:id/favorite で切り替える） */
  isFavorite: boolean
  cookCount: number | null
  score: number | null
  ingredients: RecipeIngredient[]
  steps: RecipeStep[]
  updatedAt: string
}

export type RecipeSummary = Pick<
  Recipe,
  | 'id'
  | 'title'
  | 'servings'
  | 'caloriesKcal'
  | 'caloriesEstimated'
  | 'hotcookMode'
  | 'sourceType'
  | 'packSeasonings'
  | 'officialMenuNo'
  | 'imageKey'
  | 'favoriteCount'
  | 'isFavorite'
  | 'cookCount'
> & {
  /** 材料の食材名（並び順どおり、重複なし） */
  ingredientNames: string[]
}

export const recipeFavoriteInputSchema = z.object({ favorite: z.boolean() })
export type RecipeFavoriteInput = z.infer<typeof recipeFavoriteInputSchema>

/** 画面に出すお気に入り数: 取り込み元の数に自分の 1 を足す。どちらもなければ null（出さない） */
export function favoriteTotal(r: { favoriteCount: number | null; isFavorite: boolean }): number | null {
  if (r.favoriteCount === null && !r.isFavorite) return null
  return (r.favoriteCount ?? 0) + (r.isFavorite ? 1 : 0)
}
