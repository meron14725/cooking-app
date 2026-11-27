import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { EstimateAttributesResponse } from '../../shared/schemas/attributes'
import { apiFetch } from '../api/client'
import { aiErrorMessage } from '../api/recipes'
import { Button } from './form'

type Totals = { ingredients: number; recipes: number }
type Status =
  | { kind: 'idle' }
  | { kind: 'running'; updated: Totals; remaining: Totals | null }
  | { kind: 'done'; updated: Totals }
  | { kind: 'stopped'; updated: Totals; remaining: Totals | null }
  | { kind: 'error'; updated: Totals; message: string }

/** AI の 1 回の呼び出しより長く待つ（画面の他の AI と同じく 90 秒で打ち切る） */
const CALL_TIMEOUT_MS = 90_000

/**
 * 食材の分類・重さとレシピの区分・系統を「まとめて推定」する（docs/design/09-recommendation-v2.md）。
 * 残りが 0 になるまで API を呼び続ける。止めたり画面を離れたりしたら、そこで止まる（保存済みの分は残る）
 */
export function EstimateAttributesPanel() {
  const qc = useQueryClient()
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const stopRef = useRef<AbortController | null>(null)

  useEffect(() => () => stopRef.current?.abort(), [])

  async function run() {
    const controller = new AbortController()
    stopRef.current = controller
    const updated: Totals = { ingredients: 0, recipes: 0 }
    let remaining: Totals | null = null
    setStatus({ kind: 'running', updated: { ...updated }, remaining })
    try {
      while (!controller.signal.aborted) {
        const res = await apiFetch<EstimateAttributesResponse>('/recipes/attributes/estimate', {
          method: 'POST',
          body: JSON.stringify({}),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(CALL_TIMEOUT_MS)]),
        })
        updated.ingredients += res.ingredients.updated
        updated.recipes += res.recipes.updated
        remaining = { ingredients: res.ingredients.remaining, recipes: res.recipes.remaining }
        if (remaining.ingredients === 0 && remaining.recipes === 0) {
          setStatus({ kind: 'done', updated: { ...updated } })
          return
        }
        setStatus({ kind: 'running', updated: { ...updated }, remaining })
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setStatus({ kind: 'error', updated: { ...updated }, message: aiErrorMessage(err) })
        return
      }
    } finally {
      stopRef.current = null
      void qc.invalidateQueries({ queryKey: ['recipes'] })
      void qc.invalidateQueries({ queryKey: ['ingredients'] })
      void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'plans' && q.queryKey[2] === 'recommendations' })
    }
    setStatus({ kind: 'stopped', updated: { ...updated }, remaining })
  }

  function stop() {
    stopRef.current?.abort()
  }

  const running = status.kind === 'running'
  return (
    <section className="space-y-3 rounded-card bg-surface p-4 shadow-card">
      <div>
        <h2 className="font-bold">分類をまとめて推定</h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">
          食材の分類と 1 つあたりの重さ、レシピの区分（主菜・副菜など）と味の系統を、名前と材料から決めます。
          決まらないものだけ AI に聞きます。手で直したものは変えません。献立の提案に使います。
        </p>
      </div>
      {status.kind !== 'idle' && <p className="text-sm">{statusText(status)}</p>}
      {status.kind === 'error' && <p className="text-sm text-danger">{status.message}</p>}
      {running ? (
        <Button variant="secondary" onClick={stop}>
          止める
        </Button>
      ) : (
        <Button onClick={run}>{status.kind === 'idle' ? '推定を始める' : 'もう一度推定する'}</Button>
      )}
    </section>
  )
}

function statusText(status: Exclude<Status, { kind: 'idle' }>): string {
  const done = `食材 ${status.updated.ingredients} 件、レシピ ${status.updated.recipes} 件を直しました`
  const rest = (r: Totals | null) => (r ? `。残りは食材 ${r.ingredients} 件、レシピ ${r.recipes} 件です` : '')
  switch (status.kind) {
    case 'running':
      return `推定しています…${status.remaining ? ` ${done}${rest(status.remaining)}` : ''}`
    case 'done':
      return `${done}。すべて終わりました`
    case 'stopped':
      return `止めました。${done}${rest(status.remaining)}`
    case 'error':
      return `途中で止まりました。${done}`
  }
}
