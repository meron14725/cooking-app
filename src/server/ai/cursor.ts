import type { ZodType } from 'zod'
import {
  type AiCallOptions,
  ingredientClassifySchema,
  type PriceEstimateResult,
  priceEstimateSchema,
  priceResearchSchema,
  recipeClassifySchema,
  type StorageEstimateResult,
  storageEstimateSchema,
  storageResearchSchema,
} from '../../shared/schemas/attributes'
import { calorieEstimateSchema, recipeDraftRawSchema } from '../../shared/schemas/recipeDraft'
import { ApiError } from '../errors'
import { looseJsonSchema } from './gemini'
import {
  CALORIE_SYSTEM,
  caloriePrompt,
  EXTRACT_SYSTEM,
  extractPrompt,
  INGREDIENT_CLASSIFY_RESEARCH,
  INGREDIENT_CLASSIFY_SYSTEM,
  ingredientClassifyPrompt,
  PRICE_ESTIMATE_SYSTEM,
  PRICE_RESEARCH,
  priceEstimatePrompt,
  RECIPE_CLASSIFY_SYSTEM,
  recipeClassifyPrompt,
  STORAGE_ESTIMATE_SYSTEM,
  STORAGE_RESEARCH,
  SUGGEST_SYSTEM,
  storageEstimatePrompt,
  suggestPrompt,
  TEXT_DRAFT_SYSTEM,
  textDraftPrompt,
  withResearch,
} from './prompts'
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
/**
 * ウェブで調べるとき（まとめて推定のジョブだけ。画面は待たない）。1 回 4 分まで、やり直しを入れて 7 分。
 * Workflow の step の時間切れ（10 分）に収める。Container 側の上限は container/src/app.ts の MAX_RESEARCH_TIMEOUT_MS
 */
export const RESEARCH_BUDGET_MS = 420_000
export const RESEARCH_ATTEMPT_MS = 240_000

type StructuredReply = { result?: unknown; error?: { code?: string; message?: string } }

/** Cursor SDK（Container の中で動く）で構造化出力を受け取る（docs/design/08-agent.md「AI プロバイダ」） */
export class CursorProvider implements AiProvider {
  constructor(private readonly opts: { fetch: AgentFetch; now?: () => number }) {}

  extractRecipe(input: Parameters<AiProvider['extractRecipe']>[0]) {
    return this.generate(EXTRACT_SYSTEM, extractPrompt(input), recipeDraftRawSchema)
  }

  draftFromText(input: Parameters<AiProvider['draftFromText']>[0]) {
    return this.generate(TEXT_DRAFT_SYSTEM, textDraftPrompt(input), recipeDraftRawSchema)
  }

  suggestRecipe(input: Parameters<AiProvider['suggestRecipe']>[0]) {
    return this.generate(SUGGEST_SYSTEM, suggestPrompt(input), recipeDraftRawSchema)
  }

  estimateCalories(input: Parameters<AiProvider['estimateCalories']>[0]) {
    return this.generate(CALORIE_SYSTEM, caloriePrompt(input), calorieEstimateSchema)
  }

  classifyIngredients(items: Parameters<AiProvider['classifyIngredients']>[0], opts: AiCallOptions = {}) {
    return this.generate(
      withResearch(INGREDIENT_CLASSIFY_SYSTEM, INGREDIENT_CLASSIFY_RESEARCH, opts.webSearch),
      ingredientClassifyPrompt(items),
      ingredientClassifySchema,
      opts,
    )
  }

  estimatePrices(
    items: Parameters<AiProvider['estimatePrices']>[0],
    opts: AiCallOptions = {},
  ): Promise<PriceEstimateResult> {
    return this.generate(
      withResearch(PRICE_ESTIMATE_SYSTEM, PRICE_RESEARCH, opts.webSearch),
      priceEstimatePrompt(items),
      opts.webSearch ? priceResearchSchema : priceEstimateSchema,
      opts,
    )
  }

  estimateStorage(
    items: Parameters<AiProvider['estimateStorage']>[0],
    opts: AiCallOptions = {},
  ): Promise<StorageEstimateResult> {
    return this.generate(
      withResearch(STORAGE_ESTIMATE_SYSTEM, STORAGE_RESEARCH, opts.webSearch),
      storageEstimatePrompt(items),
      opts.webSearch ? storageResearchSchema : storageEstimateSchema,
      opts,
    )
  }

  classifyRecipes(items: Parameters<AiProvider['classifyRecipes']>[0]) {
    return this.generate(RECIPE_CLASSIFY_SYSTEM, recipeClassifyPrompt(items), recipeClassifySchema)
  }

  private async generate<T>(system: string, prompt: string, schema: ZodType<T>, opts: AiCallOptions = {}): Promise<T> {
    const now = this.opts.now ?? Date.now
    const started = now()
    const jsonSchema = looseJsonSchema(schema)
    const webSearch = opts.webSearch === true
    const budget = webSearch ? RESEARCH_BUDGET_MS : BUDGET_MS
    const perAttempt = webSearch ? RESEARCH_ATTEMPT_MS : ATTEMPT_MS
    let lastError: unknown
    for (let attempt = 0; attempt < 2; attempt++) {
      const remaining = budget - (now() - started)
      if (attempt > 0 && remaining < MIN_RETRY_MS) break
      const result = await this.call({ system, prompt, jsonSchema, webSearch }, Math.min(perAttempt, remaining))
      const parsed = schema.safeParse(result)
      if (parsed.success) return parsed.data
      lastError = parsed.error
    }
    throw new AiError('AI の応答を読み取れませんでした。もう一度試してください', String(lastError))
  }

  private async call(
    body: { system: string; prompt: string; jsonSchema: unknown; webSearch: boolean },
    timeoutMs: number,
  ) {
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
      // Worker 側の待ち時間切れ（Container が固まった）は起動中ではなく時間切れとして返す
      if (err instanceof Error && err.name === 'TimeoutError') {
        throw new AiError('AI が時間内に終わりませんでした。もう一度試してください')
      }
      throw new ApiError(503, 'AI_STARTING', 'AI を起動しています。少し待ってもう一度試してください', String(err))
    }
    const reply = (await res.json().catch(() => ({}))) as StructuredReply
    if (res.status === 503) {
      // code のない 503 は Container の起動中・不調など一時的なものとして扱う（設定がないときは Container が AI_NOT_CONFIGURED を返す）
      throw new ApiError(
        503,
        reply.error?.code ?? 'AI_UNAVAILABLE',
        reply.error?.message ?? 'AI が一時的に使えません。少し待ってもう一度試してください',
      )
    }
    if (res.status === 504) throw new AiError('AI が時間内に終わりませんでした。もう一度試してください')
    if (!res.ok) throw new AiError('AI がエラーを返しました', { status: res.status, error: reply.error })
    return reply.result
  }
}
