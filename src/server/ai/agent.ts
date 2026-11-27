import { ApiError } from '../errors'
import type { AgentFetch } from './cursor'
import { type AiEnv, AiError } from './provider'

/** エージェントに渡す読む道具（Worker が作ったスナップショット） */
export type AgentReadTool = { name: string; description: string; result?: unknown; itemsById?: Record<string, unknown> }
/** 変更案の道具（呼ばれた引数を記録するだけ） */
export type AgentOpTool = { name: string; description: string; inputSchema: Record<string, unknown> }
export type AgentCall = { tool: string; args: Record<string, unknown> }

export interface AgentRunner {
  run(input: {
    instruction: string
    prompt: string
    readTools: AgentReadTool[]
    opTools: AgentOpTool[]
  }): Promise<{ reply: string; calls: AgentCall[] }>
}

/** Container の中のエージェントは 75 秒で打ち切る。画面は 90 秒 */
const AGENT_TIMEOUT_MS = 75_000

type AgentReply = { reply?: string; calls?: AgentCall[]; error?: { code?: string; message?: string } }

export class CursorAgentRunner implements AgentRunner {
  constructor(private readonly opts: { fetch: AgentFetch }) {}

  async run(input: Parameters<AgentRunner['run']>[0]) {
    let res: Response
    try {
      res = await this.opts.fetch(
        new Request('http://agent/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: input.prompt,
            readTools: input.readTools,
            opTools: input.opTools,
            timeoutMs: AGENT_TIMEOUT_MS,
          }),
          signal: AbortSignal.timeout(AGENT_TIMEOUT_MS + 5_000),
        }),
      )
    } catch (err) {
      if (err instanceof Error && err.name === 'TimeoutError') {
        throw new AiError('AI が時間内に終わりませんでした。もう一度試してください')
      }
      throw new ApiError(503, 'AI_STARTING', 'AI を起動しています。少し待ってもう一度試してください', String(err))
    }
    const reply = (await res.json().catch(() => ({}))) as AgentReply
    if (res.status === 503) {
      throw new ApiError(503, reply.error?.code ?? 'AI_NOT_CONFIGURED', reply.error?.message ?? 'AI が使えません')
    }
    if (res.status === 504) throw new AiError('AI が時間内に終わりませんでした。もう一度試してください')
    if (!res.ok) throw new AiError('AI がエラーを返しました', { status: res.status, error: reply.error })
    return { reply: reply.reply ?? '', calls: Array.isArray(reply.calls) ? reply.calls : [] }
  }
}

/**
 * テストとローカル開発用。「使った」を含む頼みなら、在庫の先頭の行を半分にする案を 1 つ出す。
 * それ以外は返事だけ
 */
export class FakeAgentRunner implements AgentRunner {
  async run(input: Parameters<AgentRunner['run']>[0]) {
    const inventory = input.readTools.find((t) => t.name === 'list_inventory')?.result as
      | { id: string; name: string; quantity: number }[]
      | undefined
    const first = inventory?.[0]
    if (!input.instruction.includes('使った') || !first) {
      return { reply: `（テスト用）「${input.instruction}」を受け取りました。変更案はありません`, calls: [] }
    }
    return {
      reply: `（テスト用）${first.name}を半分にする案です`,
      calls: [
        {
          tool: 'propose_inventory_update',
          args: { targetId: first.id, input: { quantity: Math.round((first.quantity / 2) * 100) / 100 } },
        },
      ],
    }
  }
}

/** AI_PROVIDER が fake ならテスト用、cursor（既定）なら Container。gemini では使えない */
export function getAgentRunner(env: AiEnv): AgentRunner {
  const name = env.AI_PROVIDER || 'cursor'
  if (name === 'fake') return new FakeAgentRunner()
  if (name !== 'cursor') {
    throw new ApiError(503, 'AI_NOT_CONFIGURED', '「AI に頼む」は Cursor（AI_PROVIDER=cursor）でだけ使えます')
  }
  const agent = env.AGENT
  if (!agent || !env.CURSOR_API_KEY) {
    throw new ApiError(
      503,
      'AI_NOT_CONFIGURED',
      'AI の設定がありません（Container の AGENT binding と CURSOR_API_KEY が必要です）',
    )
  }
  return new CursorAgentRunner({ fetch: (req) => agent.get(agent.idFromName(AGENT_INSTANCE)).fetch(req) })
}

/** Container のインスタンスは 1 つだけ（名前で固定） */
export const AGENT_INSTANCE = 'cooking-app-agent'
