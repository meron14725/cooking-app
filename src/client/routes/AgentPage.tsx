import { useState } from 'react'
import type { AgentApplyResult, AgentResult } from '../../shared/schemas/agent'
import { useAgentApply, useAgentRequest } from '../api/agent'
import { aiErrorMessage } from '../api/recipes'
import { Button, Field, inputClass } from '../components/form'
import { PageHeader } from '../components/PageHeader'

const EXAMPLES = ['玉ねぎを半分使った', '鶏むね肉を 2 枚買って冷凍した', '買い物リストから牛乳を消して']

/** S13 AI に頼む: 頼む → 変更案（変更前 → 変更後）を選ぶ → 反映（docs/design/08-agent.md） */
export function AgentPage() {
  const request = useAgentRequest()
  const apply = useAgentApply()
  const [instruction, setInstruction] = useState('')
  const [result, setResult] = useState<AgentResult | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [applied, setApplied] = useState<{ summary: string; outcome: AgentApplyResult['results'][number] }[] | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)

  async function onAsk(e: React.FormEvent) {
    e.preventDefault()
    if (!instruction.trim()) return setError('頼みたいことを書いてください')
    setError(null)
    setResult(null)
    setApplied(null)
    try {
      const r = await request.mutateAsync(instruction.trim())
      setResult(r)
      setSelected(new Set(r.operations.map((_, i) => i)))
    } catch (err) {
      setError(aiErrorMessage(err))
    }
  }

  async function onApply() {
    if (!result) return
    const chosen = result.operations.filter((_, i) => selected.has(i))
    if (chosen.length === 0) return setError('反映するものを選んでください')
    setError(null)
    try {
      const { results } = await apply.mutateAsync(chosen)
      setApplied(chosen.map((o, i) => ({ summary: o.summary, outcome: results[i] ?? { ok: false } })))
      // 反映した案は一覧から消す（2 回押しても二重に反映しない）
      setResult(null)
      setInstruction('')
    } catch (err) {
      setError(aiErrorMessage(err))
    }
  }

  const toggle = (i: number) =>
    setSelected((cur) => {
      const next = new Set(cur)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  return (
    <>
      <PageHeader title="AI に頼む" />
      <form onSubmit={onAsk} className="mb-5 space-y-3" noValidate>
        <Field label="頼みたいこと" hint={`例: ${EXAMPLES.join(' / ')}`}>
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            maxLength={500}
            rows={3}
            className={inputClass}
          />
        </Field>
        <Button type="submit" disabled={request.isPending || apply.isPending} className="w-full">
          {request.isPending ? 'AI が考えています…（1 分ほど）' : '頼む'}
        </Button>
        <p className="text-xs text-stone-500">
          AI は変更案を出すだけです。下で確認して「反映する」を押すまで、在庫やレシピは変わりません
        </p>
      </form>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {result && (
        <section className="space-y-3">
          {result.reply && <p className="rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-900">{result.reply}</p>}
          {result.warnings.length > 0 && (
            <ul className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {result.warnings.map((w) => (
                <li key={w}>⚠️ {w}</li>
              ))}
            </ul>
          )}
          {result.operations.length === 0 ? (
            <p className="text-sm text-stone-500">変更案はありません</p>
          ) : (
            <>
              <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
                {result.operations.map((o, i) => (
                  // 同じ案が 2 つ並ぶことがあるので位置をキーにする
                  // biome-ignore lint/suspicious/noArrayIndexKey: 一覧は反映まで並べ替えない
                  <li key={i}>
                    <label className="flex min-h-11 items-start gap-3 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(i)}
                        onChange={() => toggle(i)}
                        className="mt-0.5 size-5 shrink-0 accent-orange-600"
                      />
                      <span className="text-sm">{o.summary}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <Button onClick={onApply} disabled={apply.isPending || selected.size === 0} className="flex-1">
                  {apply.isPending ? '反映しています…' : `選んだ ${selected.size} 件を反映する`}
                </Button>
                <Button variant="secondary" onClick={() => setResult(null)} disabled={apply.isPending}>
                  やめる
                </Button>
              </div>
            </>
          )}
        </section>
      )}

      {applied && (
        <section>
          <h2 className="mb-2 text-sm font-bold text-stone-500">反映の結果</h2>
          <ul className="space-y-1 text-sm">
            {applied.map((a, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: 結果は並べ替えない
              <li key={i} className={a.outcome.ok ? 'text-green-700' : 'text-red-600'}>
                {a.outcome.ok ? '✓' : '✗'} {a.summary}
                {!a.outcome.ok && a.outcome.error && <span className="block text-xs">{a.outcome.error}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
