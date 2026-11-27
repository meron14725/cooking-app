import { ApiError } from '../errors'
import { FakeProvider } from './fake'
import { GeminiProvider } from './gemini'
import type { AiEnv, AiProvider } from './provider'

/** 環境変数 AI_PROVIDER でプロバイダを選ぶ（既定は gemini） */
export function getProvider(env: AiEnv): AiProvider {
  const name = env.AI_PROVIDER || 'gemini'
  switch (name) {
    case 'fake':
      return new FakeProvider()
    case 'gemini':
      if (!env.GEMINI_API_KEY) {
        throw new ApiError(503, 'AI_NOT_CONFIGURED', 'AI の API キーが設定されていません（GEMINI_API_KEY）')
      }
      return new GeminiProvider({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL || undefined })
    default:
      throw new ApiError(503, 'AI_NOT_CONFIGURED', `AI プロバイダ「${name}」は使えません`)
  }
}
