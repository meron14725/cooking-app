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
}) => Promise<{ usage?: unknown; text?: string }>

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

/** 読む道具: result をそのまま返すか、itemsById から id で引いて返す（Worker が作ったスナップショット） */
type ReadTool = { name: string; description: string; result?: unknown; itemsById?: Record<string, unknown> }
/** 変更案の道具: 呼ばれた引数を記録するだけ（DB は変えない） */
type OpTool = { name: string; description: string; inputSchema: Record<string, unknown> }

/** 1 回の頼みで記録する変更案の上限（docs/design/08-agent.md） */
export const MAX_OPERATIONS = 20

const isTool = (v: unknown): v is { name: string; description: string } =>
  isObject(v) && typeof v.name === 'string' && typeof v.description === 'string'

/**
 * POST /agent: { prompt, readTools, opTools, timeoutMs? } → { reply, calls, usage, durationMs }
 * 「AI に頼む」。エージェントは読む道具で調べ、変更案の道具を呼ぶ。反映は Worker が本人の確認のあとで行う
 */
export async function handleAgent(body: unknown, runAgent: RunAgent): Promise<Reply> {
  if (
    !isObject(body) ||
    typeof body.prompt !== 'string' ||
    !Array.isArray(body.readTools) ||
    !Array.isArray(body.opTools) ||
    !body.readTools.every(isTool) ||
    !body.opTools.every((t) => isTool(t) && isObject((t as OpTool).inputSchema))
  ) {
    return error(400, 'BAD_REQUEST', 'prompt, readTools, opTools が必要です')
  }
  const timeoutMs =
    typeof body.timeoutMs === 'number' && body.timeoutMs > 0 ? Math.min(body.timeoutMs, MAX_TIMEOUT_MS) : MAX_TIMEOUT_MS

  const calls: { tool: string; args: Record<string, unknown> }[] = []
  const tools: Record<string, ToolDef> = {}
  for (const t of body.readTools as ReadTool[]) {
    tools[t.name] = t.itemsById
      ? {
          description: t.description,
          inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
          execute: (args) => {
            const item = typeof args.id === 'string' ? t.itemsById?.[args.id] : undefined
            return item === undefined ? '見つかりません。一覧の id を使ってください' : JSON.stringify(item)
          },
        }
      : {
          description: t.description,
          inputSchema: { type: 'object', properties: {} },
          execute: () => JSON.stringify(t.result ?? null),
        }
  }
  for (const t of body.opTools as OpTool[]) {
    tools[t.name] = {
      description: t.description,
      inputSchema: t.inputSchema,
      execute: (args) => {
        if (calls.length >= MAX_OPERATIONS) return `変更案は ${MAX_OPERATIONS} 件までです。これ以上は記録しません`
        calls.push({ tool: t.name, args })
        return '変更案として記録しました（まだ反映されていません。本人が確認してから反映します）'
      },
    }
  }

  const started = Date.now()
  const signal = AbortSignal.timeout(timeoutMs)
  try {
    const { usage, text } = await Promise.race([
      runAgent({ prompt: body.prompt, tools, signal }),
      new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })),
    ])
    return { status: 200, body: { reply: text ?? '', calls, usage: usage ?? null, durationMs: Date.now() - started } }
  } catch (err) {
    if (signal.aborted) return error(504, 'TIMEOUT', 'エージェントが時間内に終わりませんでした')
    return error(502, 'AGENT_ERROR', err instanceof Error ? err.message : String(err))
  }
}
