import { useState } from 'react'
import type { AgentApplyResult, AgentOp, AgentResult } from '../../shared/schemas/agent'
import { useAgentApply, useAgentRequest } from '../api/agent'
import { aiErrorMessage } from '../api/recipes'
import { Button } from '../components/form'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'

const EXAMPLES = ['玉ねぎを半分使った', '鶏むね肉を 2 枚買って冷凍した', '買い物リストから牛乳を消して']

const TARGET_LABELS: Record<string, string> = {
  inventory: '在庫',
  recipe: 'レシピ',
  shopping: '買い物リスト',
  plan: '献立',
}
const targetLabel = (op: AgentOp) => TARGET_LABELS[op.split('.')[0] ?? ''] ?? ''

function AiBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
        <Icon name="sparkle" size={16} />
      </span>
      <div className="min-w-0 flex-1 pt-1 text-[15px] leading-[1.7]">{children}</div>
    </div>
  )
}

/** S13 AI に頼む: 頼む → 変更案を選ぶ → 反映（docs/design/08-agent.md） */
export function AgentPage() {
  const request = useAgentRequest()
  const apply = useAgentApply()
  const [instruction, setInstruction] = useState('')
  const [asked, setAsked] = useState<string | null>(null)
  const [result, setResult] = useState<AgentResult | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [applied, setApplied] = useState<{ summary: string; outcome: AgentApplyResult['results'][number] }[] | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)

  async function onAsk(e: React.FormEvent) {
    e.preventDefault()
    const text = instruction.trim()
    if (!text) return setError('頼みたいことを書いてください')
    setError(null)
    setResult(null)
    setApplied(null)
    setAsked(text)
    try {
      const r = await request.mutateAsync(text)
      setResult(r)
      setSelected(new Set(r.operations.map((_, i) => i)))
      setInstruction('')
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

  const busy = request.isPending || apply.isPending

  return (
    <>
      <PageHeader title="AI に頼む" backTo="/more" />

      {/* 下の入力欄の分だけ空ける */}
      {/* Layout の下余白（タブバー分）に、下に固定した入力欄の分を足す */}
      <div className="flex flex-col gap-4 pb-16">
        {!asked && (
          <AiBubble>
            <p>在庫・レシピ・買い物リスト・献立の変更を頼めます。変更案を出すので、確認してから反映してください。</p>
            <p className="mt-2 text-[13px] text-ink-muted">例: {EXAMPLES.join(' / ')}</p>
          </AiBubble>
        )}

        {asked && (
          <div className="max-w-[82%] self-end rounded-[18px] rounded-br-[4px] bg-ink px-3.5 py-3 text-[15px] leading-relaxed whitespace-pre-wrap text-white">
            {asked}
          </div>
        )}

        {request.isPending && (
          <AiBubble>
            <p className="text-ink-muted">考えています…（1 分ほど）</p>
          </AiBubble>
        )}

        {result && (
          <>
            <AiBubble>
              <p>
                {result.reply || (result.operations.length === 0 ? '変更案はありません。' : '変更案を作りました。')}
              </p>
              {result.warnings.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1 rounded-[10px] bg-warn-wash px-3 py-2 text-[13px] text-warn">
                  {result.warnings.map((w) => (
                    <li key={w} className="flex items-start gap-1.5">
                      <Icon name="warning" size={16} strokeWidth={2} className="mt-0.5" />
                      {w}
                    </li>
                  ))}
                </ul>
              )}
            </AiBubble>

            {result.operations.length > 0 && (
              <section aria-label="変更案" className="overflow-hidden rounded-card bg-surface shadow-card">
                <div className="flex items-baseline justify-between px-4 pt-3.5 pb-2.5">
                  <h2 className="text-sm font-bold">変更案</h2>
                  <p className="text-xs text-ink-muted">
                    {selected.size} / {result.operations.length} 件を選択
                  </p>
                </div>
                <ul>
                  {result.operations.map((o, i) => (
                    // 同じ案が 2 つ並ぶことがあるので位置をキーにする
                    // biome-ignore lint/suspicious/noArrayIndexKey: 一覧は反映まで並べ替えない
                    <li key={i}>
                      <label className="flex min-h-14 cursor-pointer items-start gap-3 border-t border-line-soft px-4 py-3.5">
                        <input
                          type="checkbox"
                          checked={selected.has(i)}
                          onChange={() => toggle(i)}
                          className="mt-0.5 size-5 shrink-0 accent-accent"
                        />
                        <span className="flex min-w-0 flex-col gap-1">
                          <span className="text-xs text-ink-muted">{targetLabel(o.op)}</span>
                          <span className="text-[15px] font-bold">{o.summary}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-col gap-1 border-t border-line-soft px-4 pt-3 pb-3">
                  <Button
                    onClick={onApply}
                    disabled={busy || selected.size === 0}
                    className="min-h-12.5 w-full text-[15px]"
                  >
                    {apply.isPending ? '反映しています…' : `選んだ ${selected.size} 件を反映`}
                  </Button>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-ink-muted">「反映」を押すまで、在庫やレシピは変わりません</p>
                    <button
                      type="button"
                      onClick={() => setResult(null)}
                      disabled={apply.isPending}
                      className="min-h-10 shrink-0 px-2 text-sm font-bold text-ink-soft disabled:opacity-50"
                    >
                      やめる
                    </button>
                  </div>
                </div>
              </section>
            )}
          </>
        )}

        {applied && (
          <AiBubble>
            <p className="mb-1.5 font-bold">反映しました</p>
            <ul className="flex flex-col gap-1 text-sm">
              {applied.map((a, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: 結果は並べ替えない
                <li key={i} className={`flex items-start gap-1.5 ${a.outcome.ok ? 'text-leaf' : 'text-danger'}`}>
                  <Icon name={a.outcome.ok ? 'check' : 'close'} size={16} strokeWidth={2.4} className="mt-0.5" />
                  <span>
                    {a.summary}
                    {!a.outcome.ok && a.outcome.error && <span className="block text-xs">{a.outcome.error}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </AiBubble>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}
      </div>

      <form
        onSubmit={onAsk}
        noValidate
        className="fixed inset-x-0 bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] mx-auto flex max-w-md items-end gap-2 bg-ground/95 px-4 pt-3 pb-3 backdrop-blur"
      >
        <label className="min-w-0 flex-1">
          <span className="sr-only">頼みたいこと</span>
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            maxLength={500}
            rows={1}
            placeholder="頼みたいことを書く"
            className="block min-h-12 w-full resize-none rounded-control border border-transparent bg-surface px-3.5 py-3 text-base shadow-card placeholder:text-ink-muted focus:border-accent focus:ring-2 focus:ring-accent-line focus:outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          aria-label="送る"
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-ink text-white disabled:opacity-50"
        >
          <Icon name="arrowUp" size={20} strokeWidth={2} />
        </button>
      </form>
    </>
  )
}
