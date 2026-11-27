import type {
  IngredientClassifyItem,
  IngredientClassifyResult,
  PriceEstimateItem,
  PriceEstimateResult,
  RecipeClassifyItem,
  RecipeClassifyResult,
} from '../../shared/schemas/attributes'
import type { EstimateCaloriesInput, RecipeDraftRaw } from '../../shared/schemas/recipeDraft'
import { ApiError } from '../errors'

/** 食材マスタの名前と基準単位（AI に渡すのはこれだけ。docs/design/06-ai.md「プライバシー」） */
export type MasterRef = { name: string; unit: string; gramsPerUnit: number | null }

/** 補完提案で AI に渡すもの（余りそうな食材の名前と量、既存レシピのタイトル、マスタ一覧だけ） */
export type SuggestPromptInput = {
  leftovers: { name: string; quantity: number; unit: string }[]
  avoidTitles: string[]
  ingredients: MasterRef[]
}

/** 「＋」のパネルに書いた文（メモ・料理名・材料の一覧など。URL は含まない）から下書きを作るときに渡すもの */
export type TextDraftPromptInput = { text: string; ingredients: MasterRef[] }

export interface AiProvider {
  extractRecipe(input: { url: string; text: string; ingredients: MasterRef[] }): Promise<RecipeDraftRaw>
  draftFromText(input: TextDraftPromptInput): Promise<RecipeDraftRaw>
  suggestRecipe(input: SuggestPromptInput): Promise<RecipeDraftRaw>
  estimateCalories(input: EstimateCaloriesInput): Promise<{ caloriesKcal: number }>
  /** 食材の分類と 1 つあたりの重さ（まとめて推定） */
  classifyIngredients(items: IngredientClassifyItem[]): Promise<IngredientClassifyResult>
  /** 食材の価格の目安（まとめて推定） */
  estimatePrices(items: PriceEstimateItem[]): Promise<PriceEstimateResult>
  /** レシピの区分と味の系統（まとめて推定） */
  classifyRecipes(items: RecipeClassifyItem[]): Promise<RecipeClassifyResult>
}

export type AiEnv = Pick<Env, 'AI_PROVIDER' | 'AGENT' | 'CURSOR_API_KEY' | 'GEMINI_API_KEY' | 'GEMINI_MODEL'>

/** AI 側の失敗（タイムアウト、応答が壊れている、など）は 502 */
export class AiError extends ApiError {
  constructor(message: string, details?: unknown) {
    super(502, 'AI_ERROR', message, details)
  }
}
