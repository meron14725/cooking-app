import { useState } from 'react'
import { addDays, todayJst } from '../../shared/domain/date'
import { PLAN_STATUS_LABELS, type Plan, type PlanRecipesInput, type ProposalView } from '../../shared/schemas/plan'
import { ApiRequestError } from '../api/client'
import {
  useConfirmPlan,
  useCreatePlan,
  useCurrentPlan,
  useDeletePlan,
  usePlanEvaluation,
  useRecommendations,
  useReplacePlanRecipes,
} from '../api/plans'
import { useRecipes } from '../api/recipes'
import { Button, inputBaseClass, inputClass } from '../components/form'
import { PageHeader } from '../components/PageHeader'
import { PrepAndPack } from '../components/PrepAndPack'
import { ShoppingListView } from '../components/ShoppingListView'

const errorMessage = (err: unknown, fallback: string) => (err instanceof ApiRequestError ? err.message : fallback)

const shortDate = (iso: string) => iso.slice(5).replace('-', '/')
const fmt = (n: number) => String(Math.round(n * 100) / 100)

function Stepper({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <fieldset className="flex shrink-0 items-center gap-1" aria-label={label}>
      <button
        type="button"
        onClick={() => onChange(Math.max(1, value - 1))}
        disabled={value <= 1}
        aria-label={`${label}を減らす`}
        className="size-9 rounded-full border border-stone-300 bg-white text-lg disabled:text-stone-300"
      >
        −
      </button>
      <span className="w-12 text-center text-sm">{value}食</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(20, value + 1))}
        aria-label={`${label}を増やす`}
        className="size-9 rounded-full border border-stone-300 bg-white text-lg"
      >
        ＋
      </button>
    </fieldset>
  )
}

// ---------- 1. 食べたい料理を選ぶ ----------

function AnchorPicker() {
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<{ recipeId: string; title: string; servings: number }[]>([])
  const recipes = useRecipes({ q: q.trim() || undefined })
  const create = useCreatePlan()
  const [error, setError] = useState<string | null>(null)

  const toggle = (id: string, title: string) =>
    setPicked((cur) =>
      cur.some((p) => p.recipeId === id)
        ? cur.filter((p) => p.recipeId !== id)
        : [...cur, { recipeId: id, title, servings: 1 }],
    )

  async function onSubmit() {
    setError(null)
    try {
      await create.mutateAsync({ anchors: picked.map(({ recipeId, servings }) => ({ recipeId, servings })) })
    } catch (err) {
      setError(errorMessage(err, '献立を作れませんでした'))
    }
  }

  return (
    <>
      <p className="mb-3 text-sm text-stone-600">
        食べたい料理を選ぶと、食材を使い切れる組み合わせを提案します（全部で 3 品）。
      </p>

      {picked.length > 0 && (
        <section className="mb-4 rounded-xl border border-orange-200 bg-orange-50 p-3">
          <h2 className="mb-2 text-sm font-bold text-stone-600">選んだ料理</h2>
          <ul className="space-y-2">
            {picked.map((p) => (
              <li key={p.recipeId} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-bold">{p.title}</span>
                <Stepper
                  label={`${p.title}の食数`}
                  value={p.servings}
                  onChange={(v) =>
                    setPicked((cur) => cur.map((x) => (x.recipeId === p.recipeId ? { ...x, servings: v } : x)))
                  }
                />
              </li>
            ))}
          </ul>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <Button onClick={onSubmit} disabled={create.isPending} className="mt-3 w-full">
            {create.isPending ? '作っています…' : '提案を見る'}
          </Button>
        </section>
      )}

      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="料理名で探す"
        aria-label="料理名で探す"
        className={`${inputBaseClass} mb-3 w-full`}
      />
      {recipes.isPending && <p className="text-stone-500">読み込み中…</p>}
      {recipes.isError && <p className="text-red-600">読み込めませんでした</p>}
      {recipes.data && recipes.data.length === 0 && <p className="text-stone-500">見つかりませんでした</p>}
      {recipes.data && recipes.data.length > 0 && (
        <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
          {recipes.data.map((r) => {
            const on = picked.some((p) => p.recipeId === r.id)
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => toggle(r.id, r.title)}
                  aria-pressed={on}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left ${on ? 'bg-orange-50' : ''}`}
                >
                  <span
                    className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-sm ${
                      on ? 'border-orange-600 bg-orange-600 text-white' : 'border-stone-300'
                    }`}
                  >
                    {on ? '✓' : ''}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{r.title}</span>
                    <span className="block truncate text-xs text-stone-500">{r.ingredientNames.join('、')}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

// ---------- 提案・評価の中身 ----------

function EvaluationDetails({ p }: { p: ProposalView }) {
  return (
    <div className="space-y-2 text-sm">
      <div>
        <h4 className="text-xs font-bold text-stone-500">買うもの（{p.shopping.length} 点）</h4>
        {p.shopping.length === 0 ? (
          <p className="text-stone-500">なし（在庫で足ります）</p>
        ) : (
          <ul className="text-stone-700">
            {p.shopping.map((s) => (
              <li key={s.ingredientId}>
                {s.name} {s.packageLabel ? `${s.packageLabel} × ${s.packageCount}` : fmt(s.buyQuantity)}
              </li>
            ))}
          </ul>
        )}
      </div>
      {p.usesInventory.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-stone-500">使う在庫</h4>
          <ul>
            {p.usesInventory.map((u) => (
              <li key={u.inventoryItemId} className={u.isExpiringSoon ? 'font-bold text-amber-700' : 'text-stone-700'}>
                {u.name} {fmt(u.quantity)}（期限 {shortDate(u.expiresOn)}
                {u.isExpiringSoon ? '・間近' : ''}）
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <h4 className="text-xs font-bold text-stone-500">余るもの</h4>
        {p.leftovers.length === 0 ? (
          <p className="text-stone-500">なし</p>
        ) : (
          <ul>
            {p.leftovers.map((l) => (
              <li key={l.ingredientId} className={l.perishable ? 'text-red-700' : 'text-stone-500'}>
                {l.name} {fmt(l.quantity)}
                {l.unit}
                {l.perishable ? '（早めに使う）' : ''}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-stone-600">
        合計カロリー: {p.totalCaloriesKcal === null ? '不明なレシピあり' : `${p.totalCaloriesKcal}kcal`}
      </p>
      {p.warnings.length > 0 && (
        <ul className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {p.warnings.map((w) => (
            <li key={w}>⚠️ {w}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

const kitLabel = (p: ProposalView, recipeId: string) =>
  p.kitLocations.find((k) => k.recipeId === recipeId)?.location === 'freezer' ? '🧊 冷凍' : '❄️ 冷蔵'

// ---------- 2. 提案から選ぶ ----------

function Proposals({ plan, onChosen }: { plan: Plan; onChosen: () => void }) {
  const recs = useRecommendations(plan.id)
  const replace = useReplacePlanRecipes(plan.id)
  const [error, setError] = useState<string | null>(null)

  async function choose(p: ProposalView) {
    setError(null)
    try {
      await replace.mutateAsync({
        recipes: p.recipes.map(({ recipeId, role, servings, dayIndex }) => ({ recipeId, role, servings, dayIndex })),
      })
      onChosen()
    } catch (err) {
      setError(errorMessage(err, '選べませんでした'))
    }
  }

  return (
    <section>
      <h2 className="mb-2 text-sm font-bold text-stone-500">提案</h2>
      {recs.isPending && <p className="text-stone-500">計算中…</p>}
      {recs.isError && <p className="text-red-600">{errorMessage(recs.error, '提案を出せませんでした')}</p>}
      {recs.data?.aiSuggestionRecommended && (
        <p className="mb-3 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">
          登録レシピだけでは余りが出やすい組み合わせです。余る食材で AI に 1
          品提案してもらう機能は、この先の更新で入ります。
        </p>
      )}
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <ol className="space-y-3">
        {recs.data?.proposals.map((p, i) => (
          <li key={p.recipes.map((r) => r.recipeId).join()} className="rounded-xl border border-stone-200 bg-white p-4">
            <h3 className="mb-2 font-bold">案 {i + 1}</h3>
            <ul className="mb-3 space-y-1">
              {p.recipes.map((r) => (
                <li key={r.recipeId} className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0">
                    <span className="mr-1 text-xs text-stone-500">{r.dayIndex}日目</span>
                    <span className="font-bold">{r.title}</span>
                    {r.role === 'added' && <span className="ml-1 text-xs text-orange-700">追加</span>}
                  </span>
                  <span className="shrink-0 text-xs text-stone-500">{kitLabel(p, r.recipeId)}</span>
                </li>
              ))}
            </ul>
            <EvaluationDetails p={p} />
            <Button onClick={() => choose(p)} disabled={replace.isPending} className="mt-3 w-full">
              この案にする
            </Button>
          </li>
        ))}
      </ol>
    </section>
  )
}

// ---------- 3. 食べる順と食数 → 確定 ----------

function OrderAndConfirm({ plan, onBack }: { plan: Plan; onBack: () => void }) {
  const evaluation = usePlanEvaluation(plan.id)
  const replace = useReplacePlanRecipes(plan.id)
  const confirm = useConfirmPlan(plan.id)
  const catalog = useRecipes()
  const [startsOn, setStartsOn] = useState(addDays(todayJst(), 1))
  const [adding, setAdding] = useState('')
  const [error, setError] = useState<string | null>(null)

  const rows = [...plan.recipes].sort((a, b) => a.dayIndex - b.dayIndex)
  const toInput = (list: typeof rows): PlanRecipesInput => ({
    recipes: list.map((r, i) => ({ recipeId: r.recipeId, role: r.role, servings: r.servings, dayIndex: i + 1 })),
  })

  async function save(list: typeof rows) {
    setError(null)
    try {
      await replace.mutateAsync(toInput(list))
    } catch (err) {
      setError(errorMessage(err, '変更できませんでした'))
    }
  }

  const move = (from: number, to: number) => {
    const list = [...rows]
    const [item] = list.splice(from, 1)
    if (!item) return
    list.splice(to, 0, item)
    return save(list)
  }

  async function onAdd(recipeId: string) {
    const r = catalog.data?.find((x) => x.id === recipeId)
    if (!r) return
    setAdding('')
    await save([
      ...rows,
      {
        recipeId: r.id,
        title: r.title,
        role: 'added',
        servings: 1,
        dayIndex: rows.length + 1,
        caloriesKcal: r.caloriesKcal,
        maxServings1_6l: null,
      },
    ])
  }

  async function onConfirm() {
    setError(null)
    try {
      await confirm.mutateAsync(startsOn)
    } catch (err) {
      setError(errorMessage(err, '確定できませんでした'))
    }
  }

  const busy = replace.isPending || confirm.isPending
  const ev = evaluation.data

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-bold text-stone-500">食べる順と食数</h2>
        <button type="button" onClick={onBack} disabled={busy} className="text-sm text-orange-700">
          提案を選び直す
        </button>
      </div>
      <ol className="mb-3 divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
        {rows.map((r, i) => (
          <li key={r.recipeId} className="px-3 py-3">
            <div className="flex items-center gap-2">
              <div className="flex shrink-0 flex-col">
                <button
                  type="button"
                  onClick={() => move(i, i - 1)}
                  disabled={busy || i === 0}
                  aria-label={`${r.title}を前の日へ`}
                  className="h-7 w-8 text-stone-600 disabled:text-stone-300"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => move(i, i + 1)}
                  disabled={busy || i === rows.length - 1}
                  aria-label={`${r.title}を後の日へ`}
                  className="h-7 w-8 text-stone-600 disabled:text-stone-300"
                >
                  ▼
                </button>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs text-stone-500">
                  {i + 1}日目（{shortDate(addDays(startsOn, i))}）{ev && ` ・ ${kitLabel(ev, r.recipeId)}`}
                </div>
                <div className="truncate font-bold">{r.title}</div>
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => save(rows.filter((x) => x.recipeId !== r.recipeId))}
                    disabled={busy}
                    className="text-xs text-red-600"
                  >
                    外す
                  </button>
                )}
              </div>
              <Stepper
                label={`${r.title}の食数`}
                value={r.servings}
                onChange={(v) => save(rows.map((x) => (x.recipeId === r.recipeId ? { ...x, servings: v } : x)))}
              />
            </div>
          </li>
        ))}
      </ol>

      <select
        value={adding}
        onChange={(e) => onAdd(e.target.value)}
        disabled={busy}
        aria-label="料理を足す"
        className={`${inputClass} mb-4`}
      >
        <option value="">＋ 料理を足す・入れ替える</option>
        {catalog.data
          ?.filter((r) => !rows.some((x) => x.recipeId === r.id))
          .map((r) => (
            <option key={r.id} value={r.id}>
              {r.title}
            </option>
          ))}
      </select>

      <div className="mb-4 rounded-xl border border-stone-200 bg-white p-4">
        {evaluation.isPending && <p className="text-sm text-stone-500">計算中…</p>}
        {evaluation.isError && <p className="text-sm text-red-600">計算できませんでした</p>}
        {ev && <EvaluationDetails p={ev} />}
      </div>

      <label className="mb-3 block text-sm font-bold text-stone-700">
        1日目
        <input
          type="date"
          value={startsOn}
          min={todayJst()}
          onChange={(e) => setStartsOn(e.target.value)}
          className={inputClass}
        />
      </label>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <Button onClick={onConfirm} disabled={busy || !startsOn} className="w-full">
        {confirm.isPending ? '確定しています…' : 'この献立で確定'}
      </Button>
    </section>
  )
}

function DraftPlan({ plan }: { plan: Plan }) {
  const [step, setStep] = useState<'proposals' | 'order'>(
    plan.recipes.some((r) => r.role === 'added') ? 'order' : 'proposals',
  )
  const replace = useReplacePlanRecipes(plan.id)
  const discard = useDeletePlan()
  const anchors = plan.recipes.filter((r) => r.role === 'anchor')

  async function backToProposals() {
    // 選んだ案を戻して、食べたい料理だけにする
    await replace.mutateAsync({
      recipes: anchors.map((r, i) => ({ recipeId: r.recipeId, role: r.role, servings: r.servings, dayIndex: i + 1 })),
    })
    setStep('proposals')
  }

  return (
    <>
      {step === 'proposals' ? (
        <>
          <section className="mb-4">
            <h2 className="mb-1 text-sm font-bold text-stone-500">食べたい料理</h2>
            <p className="font-bold">{anchors.map((r) => `${r.title}（${r.servings}食）`).join('、') || 'なし'}</p>
          </section>
          <Proposals plan={plan} onChosen={() => setStep('order')} />
        </>
      ) : (
        <OrderAndConfirm plan={plan} onBack={backToProposals} />
      )}
      <Button
        variant="secondary"
        onClick={() => discard.mutate(plan.id)}
        disabled={discard.isPending}
        className="mt-6 w-full"
      >
        この献立をやめる
      </Button>
    </>
  )
}

function ConfirmedPlan({ plan }: { plan: Plan }) {
  const discard = useDeletePlan()
  const rows = [...plan.recipes].sort((a, b) => a.dayIndex - b.dayIndex)
  return (
    <section>
      <p className="mb-3 inline-block rounded-full bg-orange-100 px-3 py-1 text-sm font-bold text-orange-800">
        {PLAN_STATUS_LABELS[plan.status]}
      </p>
      <ol className="mb-4 divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
        {rows.map((r) => (
          <li key={r.recipeId} className="px-4 py-3">
            <div className="text-xs text-stone-500">
              {r.dayIndex}日目{plan.startsOn && `（${shortDate(addDays(plan.startsOn, r.dayIndex - 1))}）`}
            </div>
            <div className="font-bold">
              {r.title} <span className="text-sm font-normal text-stone-500">{r.servings}食</span>
            </div>
          </li>
        ))}
      </ol>
      {plan.status === 'shopping' && <ShoppingListView planId={plan.id} />}
      {plan.status === 'prepping' && <PrepAndPack planId={plan.id} />}
      {plan.status === 'shopping' && (
        <Button
          variant="secondary"
          onClick={() => discard.mutate(plan.id)}
          disabled={discard.isPending}
          className="mt-6 w-full"
        >
          この献立を取り消す
        </Button>
      )}
    </section>
  )
}

export function PlanPage() {
  const current = useCurrentPlan()
  return (
    <>
      <PageHeader title="献立" />
      {current.isPending && <p className="text-stone-500">読み込み中…</p>}
      {current.isError && <p className="text-red-600">読み込めませんでした</p>}
      {current.isSuccess &&
        (current.data === null ? (
          <AnchorPicker />
        ) : current.data.status === 'draft' ? (
          <DraftPlan key={current.data.id} plan={current.data} />
        ) : (
          <ConfirmedPlan plan={current.data} />
        ))}
    </>
  )
}
