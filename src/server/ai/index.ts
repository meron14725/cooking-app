import { ApiError } from '../errors'
import { CursorProvider } from './cursor'
import { FakeProvider } from './fake'
import { GeminiProvider } from './gemini'
import type { AiEnv, AiProvider } from './provider'

/**
 * 環境変数 AI_PROVIDER でプロバイダを選ぶ（既定は cursor）。
 * 設定が足りないときは 503 にする。黙って fake にはしない（本番の設定漏れに気づけるように）
 */
export function getProvider(env: AiEnv): AiProvider {
  const name = env.AI_PROVIDER || 'cursor'
  switch (name) {
    case 'fake':
      return new FakeProvider()
    case 'cursor': {
      const agent = env.AGENT
      if (!agent || !env.CURSOR_API_KEY) {
        throw new ApiError(
          503,
          'AI_NOT_CONFIGURED',
          'AI の設定がありません（Container の AGENT binding と CURSOR_API_KEY が必要です）',
        )
      }
      // インスタンスは 1 つだけ（名前で固定）。@cloudflare/containers の getContainer と同じ。
      // ここで @cloudflare/containers を import すると Node のテストで cloudflare:workers が読めないので使わない
      return new CursorProvider({ fetch: (req) => agent.get(agent.idFromName('cooking-app-agent')).fetch(req) })
    }
    case 'gemini':
      if (!env.GEMINI_API_KEY) {
        throw new ApiError(503, 'AI_NOT_CONFIGURED', 'AI の API キーが設定されていません（GEMINI_API_KEY）')
      }
      return new GeminiProvider({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL || undefined })
    default:
      throw new ApiError(503, 'AI_NOT_CONFIGURED', `AI プロバイダ「${name}」は使えません`)
  }
}
