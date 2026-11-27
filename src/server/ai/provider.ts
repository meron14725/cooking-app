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

export interface AiProvider {
  extractRecipe(input: { url: string; text: string; ingredients: MasterRef[] }): Promise<RecipeDraftRaw>
  suggestRecipe(input: SuggestPromptInput): Promise<RecipeDraftRaw>
  estimateCalories(input: EstimateCaloriesInput): Promise<{ caloriesKcal: number }>
}

export type AiEnv = Pick<Env, 'AI_PROVIDER' | 'GEMINI_API_KEY' | 'GEMINI_MODEL'>

/** AI 側の失敗（タイムアウト、応答が壊れている、など）は 502 */
export class AiError extends ApiError {
  constructor(message: string, details?: unknown) {
    super(502, 'AI_ERROR', message, details)
  }
}
