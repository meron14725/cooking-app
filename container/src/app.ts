/**
 * Container の HTTP の中身（docs/design/08-agent.md「Container の中」）。
 * エージェントの実行（runAgent）は外から渡すので、テストでは Cursor SDK を呼ばずに試せる。
 */

export type ToolDef = {
  description: string
  inputSchema: Record<string, unknown>
  execute: (args: Record<string, unknown>) => string | Promise<string>
}

export type RunAgent = (input: {
  prompt: string
  tools: Record<string, ToolDef>
  signal: AbortSignal
}) => Promise<{ usage?: unknown }>

export type Reply = { status: number; body: unknown }

const error = (status: number, code: string, message: string): Reply => ({ status, body: { error: { code, message } } })

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** 1 回の実行の上限。Worker 側（CursorProvider）の待ち時間より少し短くする */
export const MAX_TIMEOUT_MS = 60_000

export function structuredPrompt(system: string, prompt: string): string {
  return `${system}

${prompt}

## 答え方
結果は必ず submit_result を 1 回だけ呼んで渡してください。submit_result を呼んだら、それで終わりです。文章での返事は要りません。`
}

/**
 * POST /structured: { system, prompt, jsonSchema, timeoutMs? } → { result, usage, durationMs }
 * submit_result の 1 回目の引数を結果にする。形の検証は Worker 側（zod）で行う
 */
export async function handleStructured(body: unknown, runAgent: RunAgent): Promise<Reply> {
  if (
    !isObject(body) ||
    typeof body.system !== 'string' ||
    typeof body.prompt !== 'string' ||
    !isObject(body.jsonSchema)
  ) {
    return error(400, 'BAD_REQUEST', 'system, prompt, jsonSchema が必要です')
  }
  const timeoutMs =
    typeof body.timeoutMs === 'number' && body.timeoutMs > 0 ? Math.min(body.timeoutMs, MAX_TIMEOUT_MS) : MAX_TIMEOUT_MS

  let result: Record<string, unknown> | undefined
  const tools: Record<string, ToolDef> = {
    submit_result: {
      description: '結果を渡す。必ず 1 回だけ呼ぶ',
      inputSchema: body.jsonSchema,
      execute: (args) => {
        if (result) return 'もう受け取っています。これで終わりです'
        result = args
        return '受け取りました。これで終わりです'
      },
    },
  }

  const started = Date.now()
  const signal = AbortSignal.timeout(timeoutMs)
  try {
    const { usage } = await Promise.race([
      runAgent({ prompt: structuredPrompt(body.system, body.prompt), tools, signal }),
      new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })),
    ])
    if (!result) return error(502, 'NO_RESULT', 'エージェントが結果を返しませんでした')
    return { status: 200, body: { result, usage: usage ?? null, durationMs: Date.now() - started } }
  } catch (err) {
    if (signal.aborted) {
      // 打ち切る前に結果が届いていれば、それを返す
      if (result) return { status: 200, body: { result, usage: null, durationMs: Date.now() - started } }
      return error(504, 'TIMEOUT', 'エージェントが時間内に終わりませんでした')
    }
    return error(502, 'AGENT_ERROR', err instanceof Error ? err.message : String(err))
  }
}
