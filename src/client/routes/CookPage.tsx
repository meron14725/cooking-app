import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import type { CookView } from '../../shared/schemas/kit'
import { ApiRequestError } from '../api/client'
import { useCookKit, useCookView, useDiscardKit, useUpdateKit } from '../api/mealKits'
import { ExpiryBadge } from '../components/ExpiryBadge'
import { Button, inputBaseClass, parseNumber } from '../components/form'
import { PageHeader } from '../components/PageHeader'

const errorMessage = (err: unknown, fallback: string) => (err instanceof ApiRequestError ? err.message : fallback)
const fmt = (n: number | null, unit: string) => (n === null ? '' : `${Math.round(n * 100) / 100}${unit}`)
const shortDate = (iso: string) => iso.slice(5).replace('-', '/')

const FROM_LABEL: Record<CookView['addOrder'][number]['from'], { label: string; className: string }> = {
  kit: { label: '袋から', className: 'bg-orange-100 text-orange-800' },
  before_cook: { label: '直前に作業したもの', className: 'bg-sky-100 text-sky-800' },
  now: { label: 'いま入れる', className: 'bg-stone-100 text-stone-700' },
}

function Section({ no, title, children }: { no: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h2 className="mb-2 flex items-center gap-2 font-bold">
        <span className="flex size-6 items-center justify-center rounded-full bg-orange-600 text-sm text-white">
          {no}
        </span>
        {title}
      </h2>
      {children}
    </section>
  )
}

function LeftoversForm({ view, onCancel }: { view: CookView; onCancel: () => void }) {
  const cook = useCookKit(view.kit.id)
  const navigate = useNavigate()
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(view.expectedLeftovers.map((l) => [l.inventoryItemId, String(l.quantity)])),
  )
  const [error, setError] = useState<string | null>(null)

  async function onSubmit() {
    setError(null)
    const leftovers: { inventoryItemId: string; quantity: number }[] = []
    for (const l of view.expectedLeftovers) {
      const q = parseNumber(values[l.inventoryItemId] ?? '')
      if (q === null || q < 0) return setError(`${l.name}の残りを入れてください`)
      if (q !== l.quantity) leftovers.push({ inventoryItemId: l.inventoryItemId, quantity: q })
    }
    try {
      await cook.mutateAsync({ leftovers })
      navigate('/')
    } catch (err) {
      setError(errorMessage(err, '記録できませんでした'))
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-orange-200 bg-orange-50 p-4">
      {view.expectedLeftovers.length === 0 ? (
        <p className="text-sm text-stone-600">在庫から使う食材はありません。</p>
      ) : (
        <>
          <p className="text-sm text-stone-600">直前に使った食材の残りを確認してください（違っていたら直す）。</p>
          {view.expectedLeftovers.map((l) => (
            <label key={l.inventoryItemId} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 font-bold">{l.name} の残り</span>
              <span className="flex shrink-0 items-center gap-1">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={values[l.inventoryItemId] ?? ''}
                  onChange={(e) => setValues((cur) => ({ ...cur, [l.inventoryItemId]: e.target.value }))}
                  className={`${inputBaseClass} w-24`}
                />
                {l.unit}
              </span>
            </label>
          ))}
        </>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button onClick={onSubmit} disabled={cook.isPending} className="flex-1">
          {cook.isPending ? '記録しています…' : 'これで記録する'}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          戻る
        </Button>
      </div>
    </div>
  )
}

function KitActions({ view }: { view: CookView }) {
  const update = useUpdateKit(view.kit.id)
  const discard = useDiscardKit(view.kit.id)
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const other = view.kit.location === 'fridge' ? 'freezer' : 'fridge'

  async function run(fn: () => Promise<unknown>, after?: () => void) {
    setError(null)
    try {
      await fn()
      after?.()
    } catch (err) {
      setError(errorMessage(err, 'できませんでした'))
    }
  }

  return (
    <div className="mt-8 space-y-2 border-t border-stone-200 pt-4">
      <Button
        variant="secondary"
        onClick={() => run(() => update.mutateAsync({ location: other }))}
        disabled={update.isPending}
        className="w-full"
      >
        {other === 'freezer' ? '冷凍庫に移した' : '冷蔵庫に移した'}（期限を計算し直す）
      </Button>
      {confirming ? (
        <div className="flex gap-2">
          <Button
            variant="danger"
            onClick={() =>
              run(
                () => discard.mutateAsync(),
                () => navigate('/fridge'),
              )
            }
            disabled={discard.isPending}
            className="flex-1"
          >
            本当に捨てる
          </Button>
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            やめる
          </Button>
        </div>
      ) : (
        <Button variant="danger" onClick={() => setConfirming(true)} className="w-full">
          この袋を捨てた
        </Button>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}

/** S08 調理: 直前作業 → 入れる順 → ホットクックの設定 → 作った */
export function CookPage() {
  const { id = '' } = useParams()
  const { data: view, isPending, isError, error } = useCookView(id)
  const [done, setDone] = useState<Set<string>>(new Set())
  const [finishing, setFinishing] = useState(false)

  if (isPending) return <p className="text-stone-500">読み込み中…</p>
  if (isError || !view) return <p className="text-red-600">{errorMessage(error, '読み込めませんでした')}</p>

  const { kit } = view
  if (kit.status !== 'stored') {
    return (
      <>
        <PageHeader title={kit.title} />
        <p className="mb-4 text-stone-600">この袋はもう{kit.status === 'cooked' ? '作りました' : '捨てました'}。</p>
        <Link to="/" className="text-orange-700">
          ホームへ
        </Link>
      </>
    )
  }

  let no = 0
  return (
    <>
      <PageHeader title={kit.title} />
      <div className="mb-5 flex items-center justify-between gap-2 text-sm text-stone-600">
        <span>
          {kit.location === 'freezer' ? '🧊 冷凍' : '❄️ 冷蔵'} ・ {kit.servings}食分 ・ {shortDate(kit.plannedOn)}{' '}
          に食べる予定
        </span>
        <ExpiryBadge daysLeft={kit.daysLeft} status={kit.expiryStatus} />
      </div>

      {view.beforeCook.length > 0 && (
        <Section no={++no} title="直前の作業">
          <ul className="divide-y divide-stone-200 overflow-hidden rounded-xl border border-stone-200 bg-white">
            {view.beforeCook.map((b) => {
              const on = done.has(b.ingredientId)
              return (
                <li key={b.ingredientId}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setDone((cur) => {
                        const next = new Set(cur)
                        if (next.has(b.ingredientId)) next.delete(b.ingredientId)
                        else next.add(b.ingredientId)
                        return next
                      })
                    }
                    className="flex w-full items-center gap-3 px-4 py-3 text-left"
                  >
                    <span
                      className={`flex size-6 shrink-0 items-center justify-center rounded-md border-2 text-sm ${
                        on ? 'border-green-600 bg-green-600 text-white' : 'border-stone-300'
                      }`}
                    >
                      {on ? '✓' : ''}
                    </span>
                    <span className={on ? 'text-stone-400 line-through' : ''}>
                      <span className="font-bold">
                        {b.name} {fmt(b.quantity, b.unit)}
                      </span>
                      <span className="block text-sm">{b.task}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </Section>
      )}

      <Section no={++no} title="入れる順">
        <ol className="space-y-2">
          {view.addOrder.map((a, i) => (
            <li key={a.ingredientId} className="flex items-baseline gap-2">
              <span className="w-5 shrink-0 text-right text-sm text-stone-400">{i + 1}.</span>
              <span className="min-w-0 flex-1">
                {a.quantity === null ? a.displayText : `${a.name} ${fmt(a.quantity, a.unit)}`}
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${FROM_LABEL[a.from].className}`}>
                {FROM_LABEL[a.from].label}
              </span>
            </li>
          ))}
        </ol>
      </Section>

      <Section no={++no} title="ホットクック">
        <p className="rounded-xl border border-stone-200 bg-white px-4 py-3 font-bold">
          {view.hotcookMode ?? '設定が登録されていません'}
        </p>
        {view.cookSteps.length > 0 && (
          <ol className="mt-2 list-decimal space-y-1 pl-6 text-sm text-stone-700">
            {view.cookSteps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        )}
        {view.notes && <p className="mt-2 text-sm text-stone-500">{view.notes}</p>}
      </Section>

      {view.frozenNotes.length > 0 && (
        <section className="mb-5 rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <h2 className="mb-1 font-bold">🧊 冷凍の袋を使うとき</h2>
          <ul className="space-y-1">
            {view.frozenNotes.map((n) => (
              <li key={n}>・{n}</li>
            ))}
          </ul>
        </section>
      )}

      {finishing ? (
        <LeftoversForm view={view} onCancel={() => setFinishing(false)} />
      ) : (
        <Button onClick={() => setFinishing(true)} className="w-full">
          作った
        </Button>
      )}

      <KitActions view={view} />
    </>
  )
}
