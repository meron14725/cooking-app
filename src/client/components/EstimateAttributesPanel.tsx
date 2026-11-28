import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { EstimateAttributesResponse } from '../../shared/schemas/attributes'
import { apiFetch } from '../api/client'
import { aiErrorMessage } from '../api/recipes'
import { Button } from './form'

type Totals = { ingredients: number; storage: number; prices: number; recipes: number }

const ZERO: Totals = { ingredients: 0, storage: 0, prices: 0, recipes: 0 }
type Status =
  | { kind: 'idle' }
  | { kind: 'running'; updated: Totals; remaining: Totals | null }
  | { kind: 'done'; updated: Totals }
  | { kind: 'stopped'; updated: Totals; remaining: Totals | null }
  | { kind: 'error'; updated: Totals; message: string }

/** AI の 1 回の呼び出しより長く待つ（画面の他の AI と同じく 90 秒で打ち切る） */
const CALL_TIMEOUT_MS = 90_000

/**
 * 食材の分類・重さ・日持ち・価格の目安とレシピの区分・系統を「まとめて推定」する（docs/design/09-recommendation-v2.md・10-cost.md・11-storage-days.md）。
 * 残りが 0 になるまで API を呼び続ける。止めたり画面を離れたりしたら、そこで止まる（保存済みの分は残る）。
 * 「古い目安を見直す」は、最初の 1 回だけ refreshStalePrices を付けて、1 年より前の目安の価格を入れ直す
 */
export function EstimateAttributesPanel() {
  const qc = useQueryClient()
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const stopRef = useRef<AbortController | null>(null)

  useEffect(() => () => stopRef.current?.abort(), [])

  async function run(refreshStalePrices: boolean) {
    const controller = new AbortController()
    stopRef.current = controller
    const updated: Totals = { ...ZERO }
    let remaining: Totals | null = null
    setStatus({ kind: 'running', updated: { ...updated }, remaining })
    try {
      let first = true
      while (!controller.signal.aborted) {
        const body = first && refreshStalePrices ? { refreshStalePrices: true } : {}
        first = false
        const res = await apiFetch<EstimateAttributesResponse>('/recipes/attributes/estimate', {
          method: 'POST',
          body: JSON.stringify(body),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(CALL_TIMEOUT_MS)]),
        })
        updated.ingredients += res.ingredients.updated
        updated.storage += res.storage.updated
        updated.prices += res.prices.updated
        updated.recipes += res.recipes.updated
        remaining = {
          ingredients: res.ingredients.remaining,
          storage: res.storage.remaining,
          prices: res.prices.remaining,
          recipes: res.recipes.remaining,
        }
        if (Object.values(remaining).every((n) => n === 0)) {
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
        <h2 className="font-bold">分類と価格をまとめて推定</h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">
          食材の分類と 1
          つあたりの重さ、日持ちと保存場所、価格の目安、レシピの区分（主菜・副菜など）と味の系統を、名前と材料から決めます。
          決まらないものだけ AI に聞きます。手で直したものは変えません。献立の提案と金額に使います。
        </p>
      </div>
      {status.kind !== 'idle' && <p className="text-sm">{statusText(status)}</p>}
      {status.kind === 'error' && <p className="text-sm text-danger">{status.message}</p>}
      {running ? (
        <Button variant="secondary" onClick={stop}>
          止める
        </Button>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => run(false)}>{status.kind === 'idle' ? '推定を始める' : 'もう一度推定する'}</Button>
          <Button variant="secondary" onClick={() => run(true)}>
            古い目安を見直す
          </Button>
        </div>
      )}
      {!running && (
        <p className="text-xs leading-relaxed text-ink-muted">
          「古い目安を見直す」は、1 年より前に自動で入れた価格を消して入れ直します。手で入れた価格は残ります。
        </p>
      )}
    </section>
  )
}

function statusText(status: Exclude<Status, { kind: 'idle' }>): string {
  const counts = (t: Totals) =>
    `食材 ${t.ingredients} 件、日持ち ${t.storage} 件、価格 ${t.prices} 件、レシピ ${t.recipes} 件`
  const done = `${counts(status.updated)}を直しました`
  const rest = (r: Totals | null) => (r ? `。残りは${counts(r)}です` : '')
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
