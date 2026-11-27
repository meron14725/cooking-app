import { Agent, emptyFs, type SDKCustomTool, type SDKJsonValue } from '@cursor/sdk'
import type { RunAgent } from './app.ts'

/**
 * Cursor SDK のローカル実行でエージェントを 1 回動かす。
 * - 道具は渡したもの（customTools）だけ。ファイル・シェル・Web・サブエージェントは使わせない
 * - ファイルは空のツリー（ホストのファイルを見せない）。ルール（AGENTS.md など）も読まない
 */
export function cursorRunner(opts: { apiKey: string; model: string; stateDir: string }): RunAgent {
  return async ({ prompt, tools, signal }) => {
    const customTools: Record<string, SDKCustomTool> = Object.fromEntries(
      Object.entries(tools).map(([name, t]) => [
        name,
        {
          description: t.description,
          inputSchema: t.inputSchema as Record<string, SDKJsonValue>,
          execute: (args) => t.execute(args),
        },
      ]),
    )
    const agent = await Agent.create({
      apiKey: opts.apiKey,
      model: { id: opts.model },
      tools: ['mcp'],
      disallowedTools: ['task'],
      local: { cwd: opts.stateDir, fs: emptyFs(), customTools },
    })
    try {
      const run = await agent.send(prompt)
      const cancel = () => void run.cancel().catch(() => {})
      signal.addEventListener('abort', cancel, { once: true })
      try {
        const result = await run.wait()
        if (result.status === 'error') throw new Error(result.error?.message ?? 'エージェントが失敗しました')
        return { usage: result.usage, text: result.result }
      } finally {
        signal.removeEventListener('abort', cancel)
      }
    } finally {
      await agent[Symbol.asyncDispose]()
    }
  }
}
