import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { shortDate } from '../../shared/domain/date'
import { splitHotcookMode } from '../../shared/domain/hotcook'
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

type AddFrom = CookView['addOrder'][number]['from']

/** 入れる順のまとまりの見た目（袋から / さっき切ったもの / いま入れるもの） */
const FROM_STYLE: Record<AddFrom, { label: string; card: string; num: string; title: string }> = {
  kit: { label: '袋から', card: 'bg-accent-soft', num: 'bg-surface text-accent', title: 'text-accent-strong' },
  before_cook: {
    label: 'さっき切ったもの',
    card: 'bg-frozen-soft',
    num: 'bg-surface text-frozen',
    title: 'text-frozen',
  },
  now: {
    label: '水と調味料など',
    card: 'bg-surface shadow-card',
    num: 'bg-sunken text-ink-soft',
    title: 'text-ink-soft',
  },
}

/** 入れる順を、続けて同じところから入れるものごとにまとめる */
function groupAddOrder(addOrder: CookView['addOrder']) {
  const groups: { from: AddFrom; items: CookView['addOrder'] }[] = []
  for (const a of addOrder) {
    const last = groups.at(-1)
    if (last && last.from === a.from) last.items.push(a)
    else groups.push({ from: a.from, items: [a] })
  }
  return groups
}

const itemText = (a: CookView['addOrder'][number]) =>
  a.quantity === null ? a.displayText : `${a.name} ${fmt(a.quantity, a.unit)}`

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
    <div className="space-y-3 rounded-card bg-surface p-5 shadow-card">
      <h2 className="text-xl font-bold">おつかれさまでした</h2>
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
                  className={`${inputBaseClass} w-24 bg-ground shadow-none`}
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
    <div className="space-y-2 rounded-card bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-1.5 pb-1 text-xs text-ink-muted">
        <span>{shortDate(view.kit.plannedOn)} に食べる</span>
        <LocationBadge location={view.kit.location} />
        <span className="ml-auto">
          <ExpiryBadge daysLeft={view.kit.daysLeft} status={view.kit.expiryStatus} />
        </span>
      </div>
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

type Step = 'before' | 'add' | 'hotcook'

const STEP_LABELS: Record<Step, string> = { before: '直前作業', add: '入れる', hotcook: 'ホットクック' }

/** S08 調理: 1 ステップずつの全画面。直前作業 → 内鍋に入れる → ホットクック → 作った（残りの確認） */
export function CookPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { data: view, isPending, isError, error } = useCookView(id)
  const [done, setDone] = useState<Set<string>>(new Set())
  const [index, setIndex] = useState(0)
  const [finishing, setFinishing] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  if (isPending) return <p className="px-5 pt-7 text-ink-muted">読み込み中…</p>
  if (isError || !view) return <p className="px-5 pt-7 text-danger">{errorMessage(error, '読み込めませんでした')}</p>

  const { kit } = view
  if (kit.status !== 'stored') {
    return (
      <div className="px-5 pt-7">
        <PageHeader title={kit.title} backTo="/" />
        <p className="mb-4 text-ink-soft">この袋はもう{kit.status === 'cooked' ? '作りました' : '捨てました'}。</p>
        <Link to="/" className="text-accent">
          ホームへ
        </Link>
      </div>
    )
  }

  const steps: Step[] = view.beforeCook.length > 0 ? ['before', 'add', 'hotcook'] : ['add', 'hotcook']
  const step = steps[Math.min(index, steps.length - 1)] ?? 'add'
  const last = index >= steps.length - 1
  const { minutes, label } = splitHotcookMode(view.hotcookMode)

  function back() {
    if (finishing) return setFinishing(false)
    if (index === 0) return navigate('/')
    setIndex(index - 1)
  }
  function next() {
    if (last) setFinishing(true)
    else setIndex(index + 1)
    window.scrollTo({ top: 0 })
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex flex-col gap-3.5 px-4 pt-5 pb-3">
        <div className="flex items-center justify-between gap-2">
          <Link
            to="/"
            aria-label="閉じる"
            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-card"
          >
            <Icon name="close" size={20} strokeWidth={2} />
          </Link>
          <Link
            to={`/recipes/${kit.recipeId}`}
            className="flex min-h-11 min-w-0 items-center gap-1 font-display text-base font-bold text-ink"
          >
            <span className="truncate">{kit.title}</span>
            <Icon name="chevronRight" size={16} strokeWidth={2.2} className="shrink-0 opacity-60" />
          </Link>
          <button
            type="button"
            aria-label="袋の操作"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className="flex size-12 shrink-0 items-center justify-center rounded-full text-ink-soft"
          >
            <Icon name="more" size={22} />
          </button>
        </div>
        <ol
          aria-label="進み具合"
          className="grid gap-1.5"
          style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
        >
          {steps.map((st, i) => {
            const state = finishing || i < index ? 'done' : i === index ? 'current' : 'todo'
            return (
              <li
                key={st}
                aria-current={state === 'current' ? 'step' : undefined}
                className={`h-2 rounded-full ${state === 'done' ? 'bg-leaf-line' : state === 'current' ? 'bg-accent' : 'bg-track'}`}
              >
                <span className="sr-only">
                  {STEP_LABELS[st]} {state === 'done' ? '済み' : state === 'current' ? '今ここ' : ''}
                </span>
              </li>
            )
          })}
        </ol>
        {menuOpen && <KitActions view={view} />}
      </header>

      <main className="flex flex-1 flex-col gap-5 px-5 py-4">
        {finishing ? (
          <LeftoversForm view={view} onCancel={() => setFinishing(false)} />
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-bold text-accent-strong">
                ステップ {index + 1} / {steps.length}
              </p>
              <h1 className="text-[32px] leading-snug font-bold">
                {step === 'before' ? '先に下ごしらえ' : step === 'add' ? '内鍋に入れる' : 'ホットクックをセット'}
              </h1>
            </div>

            {step === 'before' && (
              <ul className="flex flex-col gap-3">
                {view.beforeCook.map((b) => {
                  const on = done.has(b.ingredientId)
                  return (
                    <li key={b.ingredientId}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          setDone((cur) => {
                            const nextSet = new Set(cur)
                            if (nextSet.has(b.ingredientId)) nextSet.delete(b.ingredientId)
                            else nextSet.add(b.ingredientId)
                            return nextSet
                          })
                        }
                        className="flex w-full items-start gap-4 rounded-item bg-surface p-5 text-left shadow-card"
                      >
                        <span
                          className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
                            on ? 'bg-leaf text-white' : 'bg-sunken text-ink-muted'
                          }`}
                        >
                          <Icon name="check" size={20} strokeWidth={2.6} />
                        </span>
                        <span className={`flex flex-col gap-1 ${on ? 'opacity-55' : ''}`}>
                          <span className="text-[13px] font-bold text-ink-soft">
                            {b.name} {fmt(b.quantity, b.unit)}
                          </span>
                          <span className={`text-xl leading-normal font-bold ${on ? 'line-through' : ''}`}>
                            {b.task}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}

            {step === 'add' && (
              <>
                {/* 凍ったまま入れる等の注意は入れる前に読む（ホットクックのステップにも出す） */}
                <FrozenNotes notes={view.frozenNotes} />
                <ol className="flex flex-col gap-3">
                  {groupAddOrder(view.addOrder).map((g, i) => {
                    const style = FROM_STYLE[g.from]
                    return (
                      <li
                        key={g.items[0]?.ingredientId ?? g.from}
                        className={`flex items-start gap-4 rounded-item p-5 ${style.card}`}
                      >
                        <span
                          className={`flex size-10 shrink-0 items-center justify-center rounded-full font-display text-xl font-bold ${style.num}`}
                        >
                          {i + 1}
                        </span>
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <p className={`text-[13px] font-bold ${style.title}`}>{style.label}</p>
                          {g.from === 'kit' ? (
                            <p className="text-xl leading-normal font-bold">
                              {g.items.map((a) => a.name).join(' ・ ')}
                            </p>
                          ) : (
                            <ul
                              className={g.from === 'now' ? 'text-lg leading-loose font-medium' : 'text-xl font-bold'}
                            >
                              {g.items.map((a) => (
                                <li key={a.ingredientId}>{itemText(a)}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ol>
                <section
                  aria-label="このあとのホットクック設定"
                  className="flex items-center justify-between gap-3 rounded-item border-2 border-dashed border-line-strong px-5 py-4"
                >
                  <div className="min-w-0">
                    <p className="text-xs text-ink-muted">つぎ ・ ホットクック</p>
                    <p className="mt-1 text-[15px] font-bold">
                      {label || view.hotcookMode || '設定が登録されていません'}
                    </p>
                  </div>
                  {minutes !== null && <Minutes value={minutes} size="md" />}
                </section>
              </>
            )}

            {step === 'hotcook' && (
              <>
                <section className="flex items-center justify-between gap-3 rounded-card bg-accent-soft px-5 py-6">
                  <p className="min-w-0 text-xl leading-normal font-bold">
                    {label || view.hotcookMode || '設定が登録されていません'}
                  </p>
                  {minutes !== null && <Minutes value={minutes} size="lg" />}
                </section>
                {view.cookSteps.length > 0 && (
                  <ol className="flex list-decimal flex-col gap-1.5 rounded-item bg-surface py-4 pr-5 pl-10 text-base shadow-card">
                    {view.cookSteps.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ol>
                )}
                <FrozenNotes notes={view.frozenNotes} />
                {view.notes && <p className="text-sm text-ink-muted">{view.notes}</p>}
              </>
            )}
          </>
        )}
      </main>

      {!finishing && (
        <div className="sticky bottom-0 grid grid-cols-[1fr_2fr] gap-2.5 bg-ground/95 px-5 pt-4 pb-[calc(24px+env(safe-area-inset-bottom))] backdrop-blur">
          <button
            type="button"
            onClick={back}
            className="min-h-15 rounded-full bg-surface text-base font-bold text-ink shadow-card"
          >
            戻る
          </button>
          <button
            type="button"
            onClick={next}
            className="min-h-15 rounded-full bg-accent text-lg font-bold text-white shadow-accent"
          >
            {step === 'before' ? 'やった' : step === 'add' ? '入れた' : '作った'}
          </button>
        </div>
      )}
    </div>
  )
}

function Minutes({ value, size }: { value: number; size: 'md' | 'lg' }) {
  return (
    <p
      className={`shrink-0 font-display leading-none font-bold text-accent ${size === 'lg' ? 'text-[56px]' : 'text-[42px]'}`}
    >
      {value}
      <span className="text-[15px] text-ink-soft">分</span>
    </p>
  )
}

/** 冷凍の袋を使うときの注意（入れる前とホットクックの設定の 2 か所に出す） */
function FrozenNotes({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null
  return (
    <section className="rounded-item bg-frozen-soft px-5 py-4 text-sm text-frozen">
      <h2 className="mb-1 flex items-center gap-1.5 font-bold">
        <Icon name="frozen" size={18} />
        冷凍の袋を使うとき
      </h2>
      <ul className="space-y-1">
        {notes.map((n) => (
          <li key={n}>・{n}</li>
        ))}
      </ul>
    </section>
  )
}
