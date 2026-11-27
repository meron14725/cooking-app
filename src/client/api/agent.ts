import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { AgentApplyResult, AgentOperation, AgentResult } from '../../shared/schemas/agent'
import { apiFetch } from './client'

/** AI の待ち時間（docs/design/08-agent.md。サーバ側は 75 秒で打ち切る） */
const AGENT_TIMEOUT_MS = 90_000

/** 頼みから変更案を作る（DB は変わらない） */
export function useAgentRequest() {
  return useMutation({
    mutationFn: (instruction: string) =>
      apiFetch<AgentResult>('/agent/requests', {
        method: 'POST',
        body: JSON.stringify({ instruction }),
        signal: AbortSignal.timeout(AGENT_TIMEOUT_MS),
      }),
  })
}

/** 選んだ変更案を反映する。在庫・レシピ・献立・買い物の表示を取り直す */
export function useAgentApply() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (operations: AgentOperation[]) =>
      apiFetch<AgentApplyResult>('/agent/apply', { method: 'POST', body: JSON.stringify({ operations }) }),
    onSuccess: () => qc.invalidateQueries(),
  })
}
