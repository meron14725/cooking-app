import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { shortDate } from '../../shared/domain/date'
import type { CookView } from '../../shared/schemas/kit'
import { ApiRequestError } from '../api/client'
import { useCookKit, useCookView, useDiscardKit, useUpdateKit } from '../api/mealKits'
import { ExpiryBadge } from '../components/ExpiryBadge'
import { Button, inputBaseClass, parseNumber } from '../components/form'
import { Icon } from '../components/Icon'
import { LocationBadge } from '../components/LocationBadge'
import { PageHeader } from '../components/PageHeader'

const errorMessage = (err: unknown, fallback: string) => (err instanceof ApiRequestError ? err.message : fallback)
const fmt = (n: number | null, unit: string) => (n === null ? '' : `${Math.round(n * 100) / 100}${unit}`)

const FROM_LABEL: Record<CookView['addOrder'][number]['from'], { label: string; className: string }> = {
  kit: { label: '袋から', className: 'bg-accent-soft text-accent-strong' },
  before_cook: { label: '直前に作業したもの', className: 'bg-frozen-soft text-frozen' },
  now: { label: 'いま入れる', className: 'bg-sunken text-ink-soft' },
}

function Section({ no, title, children }: { no: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 flex flex-col gap-2.5">
      <h2 className="flex items-center gap-2 text-base font-bold">
        <span className="flex size-6 items-center justify-center rounded-full bg-accent text-[13px] text-white">
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
    <div className="space-y-3 rounded-card border border-accent-line bg-accent-wash p-4">
      {view.expectedLeftovers.length === 0 ? (
        <p className="text-sm text-ink-soft">在庫から使う食材はありません。</p>
      ) : (
        <>
          <p className="text-sm text-ink-soft">直前に使った食材の残りを確認してください（違っていたら直す）。</p>
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
      {error && <p className="text-sm text-danger">{error}</p>}
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
    <div className="mt-8 space-y-2 border-t border-line pt-4">
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
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  )
}

/** S08 調理: 直前作業 → 入れる順 → ホットクックの設定 → 作った */
export function CookPage() {
  const { id = '' } = useParams()
  const { data: view, isPending, isError, error } = useCookView(id)
  const [done, setDone] = useState<Set<string>>(new Set())
  const [finishing, setFinishing] = useState(false)

  if (isPending) return <p className="text-ink-muted">読み込み中…</p>
  if (isError || !view) return <p className="text-danger">{errorMessage(error, '読み込めませんでした')}</p>

  const { kit } = view
  if (kit.status !== 'stored') {
    return (
      <>
        <PageHeader title={kit.title} backTo="/" />
        <p className="mb-4 text-ink-soft">この袋はもう{kit.status === 'cooked' ? '作りました' : '捨てました'}。</p>
        <Link to="/" className="text-accent">
          ホームへ
        </Link>
      </>
    )
  }

  let no = 0
  return (
    <>
      <div className="-mx-2 mb-1 flex items-center gap-1">
        <Link to="/" aria-label="戻る" className="flex size-11 items-center justify-center rounded-full text-ink">
          <Icon name="chevronLeft" size={22} strokeWidth={2} />
        </Link>
        <p className="text-sm font-bold text-ink-muted">調理</p>
      </div>
      <div className="mb-6 flex flex-col gap-2">
        <h1 className="text-[26px] leading-snug font-bold">{kit.title}</h1>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-bold text-accent-strong">
            {shortDate(kit.plannedOn)} に食べる
          </span>
          <LocationBadge location={kit.location} />
          <span className="text-xs text-ink-muted">{kit.servings}食分</span>
          <span className="ml-auto">
            <ExpiryBadge daysLeft={kit.daysLeft} status={kit.expiryStatus} />
          </span>
        </div>
      </div>

      {view.beforeCook.length > 0 && (
        <Section no={++no} title="直前の作業">
          <ul className="divide-y divide-line-soft overflow-hidden rounded-[16px] border border-line bg-surface">
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
                    className="flex min-h-15 w-full items-center gap-3 px-4 py-3 text-left"
                  >
                    <span
                      className={`flex size-6 shrink-0 items-center justify-center rounded-md border-2 ${
                        on ? 'border-leaf bg-leaf text-white' : 'border-line-strong bg-surface'
                      }`}
                    >
                      {on && <Icon name="check" size={16} strokeWidth={2.8} />}
                    </span>
                    <span className={on ? 'opacity-55 line-through' : ''}>
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
        <ol className="divide-y divide-line-soft rounded-[16px] border border-line bg-surface px-4">
          {view.addOrder.map((a, i) => (
            <li key={a.ingredientId} className="flex items-start gap-3 py-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-line-strong text-xs font-bold text-ink-muted">
                {i + 1}
              </span>
              <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
                <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${FROM_LABEL[a.from].className}`}>
                  {FROM_LABEL[a.from].label}
                </span>
                <span className="text-[15px]">
                  {a.quantity === null ? a.displayText : `${a.name} ${fmt(a.quantity, a.unit)}`}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </Section>

      <Section no={++no} title="ホットクックの設定">
        <p className="rounded-[16px] border-[1.5px] border-accent-line bg-surface px-4 py-4 text-lg font-bold">
          {view.hotcookMode ?? '設定が登録されていません'}
        </p>
        {view.cookSteps.length > 0 && (
          <ol className="list-decimal space-y-1 pl-6 text-sm text-ink-soft">
            {view.cookSteps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        )}
        {view.notes && <p className="text-sm text-ink-muted">{view.notes}</p>}
      </Section>

      {view.frozenNotes.length > 0 && (
        <section className="mb-6 rounded-[16px] bg-frozen-soft px-4 py-3.5 text-sm text-frozen">
          <h2 className="mb-1 flex items-center gap-1.5 font-bold">
            <Icon name="frozen" size={18} />
            冷凍の袋を使うとき
          </h2>
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
        <Button onClick={() => setFinishing(true)} className="min-h-14 w-full text-base">
          作った
        </Button>
      )}

      <KitActions view={view} />
    </>
  )
}
