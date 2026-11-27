import { type ZodType, z } from 'zod'
import { calorieEstimateSchema, recipeDraftRawSchema } from '../../shared/schemas/recipeDraft'
import { CALORIE_SYSTEM, caloriePrompt, EXTRACT_SYSTEM, extractPrompt } from './prompts'
import { AiError, type AiProvider } from './provider'

const DEFAULT_MODEL = 'gemini-3.8-flash'
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'
/** 画面は 30 秒で打ち切る。ページ取得 10 秒 + AI 9 秒 × 2 回（再試行）= 28 秒に収める */
const TIMEOUT_MS = 9_000

const CONSTRAINT_KEYS = new Set([
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'format',
  'pattern',
])

/**
 * zod から JSON スキーマを作り、範囲や長さの制約を外す。
 * 制約が多いと Gemini が「状態が多すぎる」と断るため。制約は返ってきた JSON を zod で検証するときに見る
 */
export function looseJsonSchema(schema: ZodType): unknown {
  const strip = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(strip)
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v)
          .filter(([k]) => !CONSTRAINT_KEYS.has(k) && k !== '$schema')
          .map(([k, val]) => [k, strip(val)]),
      )
    }
    return v
  }
  return strip(z.toJSONSchema(schema, { io: 'output' }))
}

type GenerateResponse = {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]
  error?: { message?: string }
}

/** Gemini API（Google AI Studio）の構造化出力を使う */
export class GeminiProvider implements AiProvider {
  private readonly model: string

  constructor(private readonly opts: { apiKey: string; model?: string; fetch?: typeof fetch }) {
    this.model = opts.model ?? DEFAULT_MODEL
  }

  extractRecipe(input: Parameters<AiProvider['extractRecipe']>[0]) {
    return this.generate(EXTRACT_SYSTEM, extractPrompt(input), recipeDraftRawSchema)
  }

  estimateCalories(input: Parameters<AiProvider['estimateCalories']>[0]) {
    return this.generate(CALORIE_SYSTEM, caloriePrompt(input), calorieEstimateSchema)
  }

  /** JSON スキーマ付きで生成し、zod で検証する。検証に失敗したら 1 回だけ再試行する */
  private async generate<T>(system: string, prompt: string, schema: ZodType<T>): Promise<T> {
    let lastError: unknown
    for (let attempt = 0; attempt < 2; attempt++) {
      const text = await this.call(system, prompt, schema)
      try {
        return schema.parse(JSON.parse(text))
      } catch (err) {
        lastError = err
      }
    }
    throw new AiError('AI の応答を読み取れませんでした。もう一度試してください', String(lastError))
  }

  private async call(system: string, prompt: string, schema: ZodType): Promise<string> {
    const doFetch = this.opts.fetch ?? fetch
    let res: Response
    try {
      res = await doFetch(`${ENDPOINT}/${this.model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.opts.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseJsonSchema: looseJsonSchema(schema),
            temperature: 0.2,
            // 抽出が主なので考える量は少なくてよい（速さを優先）
            thinkingConfig: { thinkingLevel: 'low' },
          },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch (err) {
      throw new AiError('AI に接続できませんでした（タイムアウトなど）', String(err))
    }
    const body = (await res.json().catch(() => ({}))) as GenerateResponse
    if (!res.ok) throw new AiError('AI がエラーを返しました', { status: res.status, message: body.error?.message })
    const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('')
    if (!text) throw new AiError('AI の応答が空でした', { finishReason: body.candidates?.[0]?.finishReason })
    return text
  }
}
