import { z } from 'zod'
import { categorySchema } from './ingredient'
import { cuisineSchema, dishTypeSchema } from './recipe'

/**
 * 「まとめて推定」（docs/design/09-recommendation-v2.md）。
 * 食材の分類・重さ → 日持ち → 価格 → レシピの区分・系統の順に、ルールで決め、残りを limit 件ずつ AI に聞く
 */
export const estimateAttributesInputSchema = z.object({
  /** 1 回で AI に聞く件数。省略したら 20（ウェブで調べるときは 5。estimateJob.ts の resolveEstimateOptions） */
  limit: z.number().int().min(1).max(40).optional(),
  /**
   * 1 年より前に入れた目安の価格（default）を未設定に戻してから推定し直す（docs/design/10-cost.md「価格が古くなったとき」）。
   * 手で入れた価格（manual）は触らない。最初の 1 回だけ true で呼ぶ
   */
  refreshStalePrices: z.boolean().default(false),
  /**
   * AI にウェブ検索で調べさせる（docs/design/06-ai.md「ウェブ検索」）。省略したら環境変数 AI_WEB_SEARCH（既定 on）に従う。
   * 検索するときは、価格と日持ちの答えに出典 URL が要る
   */
  webSearch: z.boolean().optional(),
})
export type EstimateAttributesInput = z.input<typeof estimateAttributesInputSchema>

export type StageProgress = { updated: number; remaining: number }

export type EstimateAttributesResponse = {
  ingredients: StageProgress
  /** 食材の日持ちと保存場所（docs/design/11-storage-days.md） */
  storage: StageProgress
  /** 食材の価格の目安（docs/design/10-cost.md） */
  prices: StageProgress
  recipes: StageProgress
}

/** AI に渡す食材（名前と分類だけ） */
export type StorageEstimateItem = { key: string; name: string; category: string }

/** AI の呼び出しの設定 */
export type AiCallOptions = {
  /** ウェブ検索で調べさせ、答えに出典 URL（sources）を付けさせる */
  webSearch?: boolean
}

/** ウェブで調べたときの出典 URL。中身は validSourceUrls() で確かめる */
const sourcesField = { sources: z.array(z.string()).max(10) }

const storageItem = z.object({
  key: z.string(),
  canFreeze: z.boolean(),
  fridgeDays: z.number().nullable(),
  freezerDays: z.number().nullable(),
  pantryDays: z.number().nullable(),
  defaultLocation: z.enum(['fridge', 'freezer', 'pantry']),
  preppedFridgeDays: z.number().nullable(),
  preppedFreezerDays: z.number().nullable(),
})

/** 範囲は zod では見ず、validStorage() で確かめる（1 件の範囲外で全部を捨てないため） */
export const storageEstimateSchema = z.object({ items: z.array(storageItem).max(40) })
/** ウェブで調べるとき（出典 URL 付き） */
export const storageResearchSchema = z.object({ items: z.array(storageItem.extend(sourcesField)).max(40) })
export type StorageEstimateResult = {
  items: (z.infer<typeof storageItem> & { sources?: string[] })[]
}

/** AI に渡す食材（名前・基準単位・代表量の名前だけ） */
export type PriceEstimateItem = { key: string; name: string; unit: string; basis: string }

const priceItem = z.object({
  key: z.string(),
  /** basis あたりの価格（円）。分からなければ null。範囲外は捨てる */
  priceYen: z.number().nullable(),
})

export const priceEstimateSchema = z.object({ items: z.array(priceItem).max(40) })
/** ウェブで調べるとき（出典 URL 付き） */
export const priceResearchSchema = z.object({ items: z.array(priceItem.extend(sourcesField)).max(40) })
export type PriceEstimateResult = { items: (z.infer<typeof priceItem> & { sources?: string[] })[] }

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
