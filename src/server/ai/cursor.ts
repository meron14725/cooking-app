import type { ZodType } from 'zod'
import { calorieEstimateSchema, recipeDraftRawSchema } from '../../shared/schemas/recipeDraft'
import { ApiError } from '../errors'
import { looseJsonSchema } from './gemini'
import { CALORIE_SYSTEM, caloriePrompt, EXTRACT_SYSTEM, extractPrompt, SUGGEST_SYSTEM, suggestPrompt } from './prompts'
import { AiError, type AiProvider } from './provider'

/** Container（AgentContainer）にリクエストを送る関数。本番は getContainer(env.AGENT).fetch */
export type AgentFetch = (request: Request) => Promise<Response>

/**
 * 1 回の AI 呼び出しにかける時間の合計。画面は 90 秒で打ち切る（URL 取り込みはページ取得 10 秒が先に入る）。
 * 1 回目は 45 秒まで、検証に失敗したら残り時間（15 秒以上あれば）で 1 回だけやり直す
 */
const BUDGET_MS = 75_000
const ATTEMPT_MS = 45_000
const MIN_RETRY_MS = 15_000

type StructuredReply = { result?: unknown; error?: { code?: string; message?: string } }

/** Cursor SDK（Container の中で動く）で構造化出力を受け取る（docs/design/08-agent.md「AI プロバイダ」） */
export class CursorProvider implements AiProvider {
  constructor(private readonly opts: { fetch: AgentFetch; now?: () => number }) {}

  extractRecipe(input: Parameters<AiProvider['extractRecipe']>[0]) {
    return this.generate(EXTRACT_SYSTEM, extractPrompt(input), recipeDraftRawSchema)
  }

  suggestRecipe(input: Parameters<AiProvider['suggestRecipe']>[0]) {
    return this.generate(SUGGEST_SYSTEM, suggestPrompt(input), recipeDraftRawSchema)
  }

  estimateCalories(input: Parameters<AiProvider['estimateCalories']>[0]) {
    return this.generate(CALORIE_SYSTEM, caloriePrompt(input), calorieEstimateSchema)
  }

  private async generate<T>(system: string, prompt: string, schema: ZodType<T>): Promise<T> {
    const now = this.opts.now ?? Date.now
    const started = now()
    const jsonSchema = looseJsonSchema(schema)
    let lastError: unknown
    for (let attempt = 0; attempt < 2; attempt++) {
      const remaining = BUDGET_MS - (now() - started)
      if (attempt > 0 && remaining < MIN_RETRY_MS) break
      const result = await this.call({ system, prompt, jsonSchema }, Math.min(ATTEMPT_MS, remaining))
      const parsed = schema.safeParse(result)
      if (parsed.success) return parsed.data
      lastError = parsed.error
    }
    throw new AiError('AI の応答を読み取れませんでした。もう一度試してください', String(lastError))
  }

  private async call(body: { system: string; prompt: string; jsonSchema: unknown }, timeoutMs: number) {
    let res: Response
    try {
      res = await this.opts.fetch(
        new Request('http://agent/structured', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, timeoutMs }),
          // Container 側の打ち切りより少し長く待つ
          signal: AbortSignal.timeout(timeoutMs + 5_000),
        }),
      )
    } catch (err) {
      throw new ApiError(503, 'AI_STARTING', 'AI を起動しています。少し待ってもう一度試してください', String(err))
    }
    const reply = (await res.json().catch(() => ({}))) as StructuredReply
    if (res.status === 503) {
      throw new ApiError(503, reply.error?.code ?? 'AI_NOT_CONFIGURED', reply.error?.message ?? 'AI が使えません')
    }
    if (res.status === 504) throw new AiError('AI が時間内に終わりませんでした。もう一度試してください')
    if (!res.ok) throw new AiError('AI がエラーを返しました', { status: res.status, error: reply.error })
    return reply.result
  }
}
