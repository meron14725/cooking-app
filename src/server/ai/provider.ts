import type { EstimateCaloriesInput, RecipeDraftRaw } from '../../shared/schemas/recipeDraft'
import { ApiError } from '../errors'

/** 食材マスタの名前と基準単位（AI に渡すのはこれだけ。docs/design/06-ai.md「プライバシー」） */
export type MasterRef = { name: string; unit: string; gramsPerUnit: number | null }

export interface AiProvider {
  extractRecipe(input: { url: string; text: string; ingredients: MasterRef[] }): Promise<RecipeDraftRaw>
  estimateCalories(input: EstimateCaloriesInput): Promise<{ caloriesKcal: number }>
}

export type AiEnv = Pick<Env, 'AI_PROVIDER' | 'GEMINI_API_KEY' | 'GEMINI_MODEL'>

/** AI 側の失敗（タイムアウト、応答が壊れている、など）は 502 */
export class AiError extends ApiError {
  constructor(message: string, details?: unknown) {
    super(502, 'AI_ERROR', message, details)
  }
}
