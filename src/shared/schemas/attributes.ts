import { z } from 'zod'
import { categorySchema } from './ingredient'
import { cuisineSchema, dishTypeSchema } from './recipe'

/**
 * 「まとめて推定」（docs/design/09-recommendation-v2.md）。
 * 食材の分類・重さ → レシピの区分・系統の順に、ルールで決め、残りを limit 件ずつ AI に聞く
 */
export const estimateAttributesInputSchema = z.object({
  /** 1 回で AI に聞く件数 */
  limit: z.number().int().min(1).max(40).default(20),
})
export type EstimateAttributesInput = z.input<typeof estimateAttributesInputSchema>

export type StageProgress = { updated: number; remaining: number }

export type EstimateAttributesResponse = {
  ingredients: StageProgress
  recipes: StageProgress
}

/** AI に渡す食材（名前と単位だけ） */
export type IngredientClassifyItem = { key: string; name: string; unit: string; needsGrams: boolean }

export const ingredientClassifySchema = z.object({
  items: z
    .array(
      z.object({
        key: z.string(),
        category: categorySchema,
        /** 基準単位 1 つあたりのおよその重さ（g）。分からなければ null */
        gramsPerUnit: z.number().positive().max(100000).nullable(),
      }),
    )
    .max(40),
})
export type IngredientClassifyResult = z.infer<typeof ingredientClassifySchema>

/** AI に渡すレシピ（料理名と材料の名前だけ） */
export type RecipeClassifyItem = { key: string; title: string; ingredientNames: string[] }

export const recipeClassifySchema = z.object({
  items: z
    .array(
      z.object({
        key: z.string(),
        dishType: dishTypeSchema.nullable(),
        cuisine: cuisineSchema.nullable(),
      }),
    )
    .max(40),
})
export type RecipeClassifyResult = z.infer<typeof recipeClassifySchema>
