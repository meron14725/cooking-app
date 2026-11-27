import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { addDays, shortDate, todayJst } from '../../shared/domain/date'
import { PLAN_STATUS_LABELS, type Plan, type PlanRecipesInput, type ProposalView } from '../../shared/schemas/plan'
import { favoriteTotal, type RecipeSort } from '../../shared/schemas/recipe'
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
import { aiErrorMessage, useRecipes, useSuggestRecipe } from '../api/recipes'
import { DishPhotoButton } from '../components/DishPhoto'
import { Button, inputClass } from '../components/form'
import { Icon } from '../components/Icon'
import { LocationBadge } from '../components/LocationBadge'
import { PageHeader } from '../components/PageHeader'
import { PlanProgress } from '../components/PlanProgress'
import { PrepAndPack } from '../components/PrepAndPack'
import { RecipePhoto } from '../components/RecipePhoto'
import { RecipeFilterButton, RecipeSortMenu } from '../components/RecipeSortMenu'
import { ShoppingListView } from '../components/ShoppingListView'
import { StickyAction } from '../components/StickyAction'

const errorMessage = (err: unknown, fallback: string) => (err instanceof ApiRequestError ? err.message : fallback)

const fmt = (n: number) => String(Math.round(n * 100) / 100)

function Stepper({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <fieldset className="flex shrink-0 items-center gap-1" aria-label={label}>
      <button
        type="button"
        onClick={() => onChange(Math.max(1, value - 1))}
        disabled={value <= 1}
        aria-label={`${label}を減らす`}
        className="flex size-9 items-center justify-center rounded-full border border-line-strong bg-surface text-lg disabled:text-line-strong"
      >
        <Icon name="minus" size={16} strokeWidth={2} />
      </button>
      <span className="w-12 text-center text-sm font-bold tabular-nums">{value}食</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(20, value + 1))}
        aria-label={`${label}を増やす`}
        className="flex size-9 items-center justify-center rounded-full border border-line-strong bg-surface text-lg"
      >
        <Icon name="plus" size={16} strokeWidth={2} />
      </button>
    </fieldset>
  )
}

// ---------- 1. 食べたい料理を選ぶ ----------

type Picked = { recipeId: string; title: string; servings: number }

/** 選んだ料理の食数。− で 1 から減らすと選択を外す（案D D-PlanPick） */
function ServingsPill({ p, onChange }: { p: Picked; onChange: (v: number) => void }) {
  const btn = 'flex size-9 items-center justify-center rounded-full bg-surface text-ink'
  return (
    <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-sunken p-0.5">
      <button
        type="button"
        onClick={() => onChange(p.servings - 1)}
        aria-label={`${p.title} を1食減らす`}
        className={btn}
      >
        <Icon name="minus" size={16} strokeWidth={2.2} />
      </button>
      <span className="min-w-11 text-center text-sm font-bold tabular-nums">{p.servings}食分</span>
      <button
        type="button"
        onClick={() => onChange(p.servings + 1)}
        disabled={p.servings >= 20}
        aria-label={`${p.title} を1食増やす`}
        className={`${btn} disabled:text-line-strong`}
      >
        <Icon name="plus" size={16} strokeWidth={2.2} />
      </button>
    </span>
  )
}

const PICKED_KEY = 'plan-picked'
function loadPicked(): Picked[] {
  try {
    const v = JSON.parse(sessionStorage.getItem(PICKED_KEY) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
function savePicked(v: Picked[]) {
  try {
    if (v.length === 0) sessionStorage.removeItem(PICKED_KEY)
    else sessionStorage.setItem(PICKED_KEY, JSON.stringify(v))
  } catch {
    // 覚えられなくても選ぶ操作はできる
  }
}

function AnchorPicker() {
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<RecipeSort | ''>('')
  // レシピを見るページの「食べたい料理に追加」から来たら、その料理を選んだ状態で始める
  const location = useLocation()
  // 選んだ料理は、「>」でレシピを見に行って戻っても残るように、このタブの間だけ覚えておく
  const [picked, setPicked] = useState<Picked[]>(() => {
    const saved = loadPicked()
    const pick = (location.state as { pick?: Picked } | null)?.pick
    return pick && !saved.some((p) => p.recipeId === pick.recipeId) ? [...saved, pick] : saved
  })
  useEffect(() => savePicked(picked), [picked])
  // 受け取った料理は覚えたので、履歴から消す（戻ってきたときに外した料理がまた入らないように）
  const navigate = useNavigate()
  useEffect(() => {
    if ((location.state as { pick?: Picked } | null)?.pick) navigate('.', { replace: true, state: null })
  }, [location.state, navigate])
  const recipes = useRecipes({ q: q.trim() || undefined, sort: sort || undefined })
  // 選んだ料理の写真は、検索で一覧から消えても出せるよう全件の一覧から引く
  const all = useRecipes()
  const imageOf = (id: string) => all.data?.find((r) => r.id === id)?.imageKey ?? null
  const create = useCreatePlan()
  const [error, setError] = useState<string | null>(null)

  const toggle = (id: string, title: string) =>
    setPicked((cur) =>
      cur.some((p) => p.recipeId === id)
        ? cur.filter((p) => p.recipeId !== id)
        : [...cur, { recipeId: id, title, servings: 1 }],
    )
  const setServings = (id: string, v: number) =>
    setPicked((cur) =>
      v <= 0 ? cur.filter((p) => p.recipeId !== id) : cur.map((p) => (p.recipeId === id ? { ...p, servings: v } : p)),
    )

  async function onSubmit() {
    setError(null)
    try {
      await create.mutateAsync({ anchors: picked.map(({ recipeId, servings }) => ({ recipeId, servings })) })
      savePicked([])
    } catch (err) {
      setError(errorMessage(err, '献立を作れませんでした'))
    }
  }

  return (
    <>
      <section className="mb-3.5 flex flex-col gap-2">
        <h2 className="font-display text-[15px] font-bold">食べたい料理</h2>
        {picked.length === 0 ? (
          <p className="flex min-h-12 items-center rounded-[24px] border-2 border-dashed border-line-dashed px-4 text-sm text-ink-muted">
            下の一覧から選んでください（全部で 3 品になるよう提案します）
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {picked.map((p) => (
              <li key={p.recipeId} className="flex items-center gap-2.5 rounded-[24px] bg-surface p-2 shadow-card">
                <RecipePhoto imageKey={imageOf(p.recipeId)} className="size-10 rounded-[14px]" />
                <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{p.title}</span>
                <ServingsPill p={p} onChange={(v) => setServings(p.recipeId, v)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-col gap-3.5">
        <label className="flex min-h-12 items-center gap-2.5 rounded-full border border-transparent bg-surface px-4 shadow-card focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-line">
          <Icon name="search" className="text-ink-muted" />
          <span className="sr-only">料理を探す</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="料理名・食材で探す"
            className="min-w-0 flex-1 bg-transparent py-2.5 text-base placeholder:text-ink-muted focus:outline-none"
          />
        </label>
        <div className="flex gap-2">
          <RecipeSortMenu value={sort} onChange={setSort} />
          <RecipeFilterButton />
        </div>

        {recipes.isPending && <p className="text-ink-muted">読み込み中…</p>}
        {recipes.isError && <p className="text-danger">読み込めませんでした</p>}
        {recipes.data && recipes.data.length === 0 && <p className="text-ink-muted">見つかりませんでした</p>}
        {recipes.data && recipes.data.length > 0 && (
          <ul className="flex flex-col gap-2.5">
            {recipes.data.map((r) => {
              const on = picked.some((p) => p.recipeId === r.id)
              const fav = favoriteTotal(r)
              return (
                <li
                  key={r.id}
                  className={`flex items-center gap-1 rounded-[24px] border-2 bg-surface py-2.5 pr-1.5 pl-3 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-accent ${
                    on ? 'border-accent shadow-[0_6px_18px_rgba(179,58,10,0.12)]' : 'border-transparent shadow-card'
                  }`}
                >
                  {/* 行を押すと選ぶ・外す。右端の「>」はレシピを見るページ（選ぶのとは別） */}
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(r.id, r.title)}
                      aria-label={`${r.title} を食べたい料理にする`}
                      className="sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 ${
                        on ? 'border-accent bg-accent text-white' : 'border-line-strong bg-surface'
                      }`}
                    >
                      {on && <Icon name="check" size={14} strokeWidth={3} />}
                    </span>
                    <RecipePhoto imageKey={r.imageKey} className="size-14 rounded-[18px]" />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-[15px] font-bold">{r.title}</span>
                      <span className="truncate text-xs text-ink-muted">{r.ingredientNames.join('、')}</span>
                      <span className="flex flex-wrap items-center gap-x-2.5 text-xs whitespace-nowrap text-ink-soft">
                        {fav !== null && (
                          <span className="flex items-center gap-0.5">
                            <Icon name="heart" size={12} strokeWidth={1.6} className="fill-[#e07a5f] text-[#e07a5f]" />
                            <span className="sr-only">お気に入り</span>
                            {fav.toLocaleString('ja-JP')}
                          </span>
                        )}
                        {r.cookCount !== null && <span>作った {r.cookCount.toLocaleString('ja-JP')}回</span>}
                        <span className="font-bold text-ink">{r.servings}人前</span>
                      </span>
                    </span>
                  </label>
                  <Link
                    to={`/recipes/${r.id}`}
                    aria-label={`${r.title} のレシピを見る`}
                    className="flex h-11 w-10 shrink-0 items-center justify-center text-ink-muted"
                  >
                    <Icon name="chevronRight" size={18} strokeWidth={2} />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <StickyAction>
        {error && <p className="text-center text-sm text-danger">{error}</p>}
        <Button
          onClick={onSubmit}
          disabled={picked.length === 0 || create.isPending}
          className="min-h-14 w-full text-base"
        >
          {create.isPending
            ? '作っています…'
            : picked.length === 0
              ? '料理を選んでください'
              : `提案を見る（${picked.length}品を選択中）`}
        </Button>
      </StickyAction>
    </>
  )
}

// ---------- 提案・評価の中身 ----------

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded-[18px] bg-ground p-2.5">
      <p className="text-[11px] text-ink-muted">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums">
        {value}
        <span className="text-xs font-medium">{unit}</span>
      </p>
    </div>
  )
}

/** 提案・評価の中身: 数字 3 つ、使える在庫と余る食材、注意、買うものの内訳 */
function EvaluationDetails({ p }: { p: ProposalView }) {
  const expiring = p.usesInventory.filter((u) => u.isExpiringSoon)
  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="買い物" value={String(p.shopping.length)} unit="点" />
        <Stat
          label="合計"
          value={p.totalCaloriesKcal === null ? '—' : p.totalCaloriesKcal.toLocaleString()}
          unit={p.totalCaloriesKcal === null ? '' : 'kcal'}
        />
        <Stat label="在庫を使う" value={String(p.usesInventory.length)} unit="品" />
      </div>
      <div className="flex flex-col gap-1.5 text-[13px]">
        <p>
          <span className="text-ink-muted">使える在庫：</span>
          {p.usesInventory.length === 0
            ? 'なし'
            : p.usesInventory.map((u) => `${u.name} ${fmt(u.quantity)}`).join('、')}
          {expiring.map((u) => (
            <span
              key={u.inventoryItemId}
              className="ml-1 inline-block rounded-md bg-warn-soft px-1.5 py-px text-[11px] font-bold text-warn"
            >
              {u.name} 期限 {shortDate(u.expiresOn)}
            </span>
          ))}
        </p>
        <p>
          <span className="text-ink-muted">余る食材：</span>
          {p.leftovers.length === 0
            ? 'なし'
            : p.leftovers.map((l, i) => (
                <span key={l.ingredientId} className={l.perishable ? 'font-bold text-danger' : ''}>
                  {i > 0 && '、'}
                  {l.name} {fmt(l.quantity)}
                  {l.unit}
                  {l.perishable && '（早めに使う）'}
                </span>
              ))}
        </p>
      </div>
      {p.warnings.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-[10px] bg-warn-wash px-3 py-2.5 text-[13px] text-warn">
          {p.warnings.map((w) => (
            <li key={w} className="flex items-start gap-2">
              <Icon name="warning" size={16} strokeWidth={2} className="mt-0.5" />
              {w}
            </li>
          ))}
        </ul>
      )}
      {p.shopping.length === 0 && <p className="text-[13px] text-ink-muted">買うものはありません（在庫で足ります）</p>}
      {p.shopping.length > 0 && (
        <details className="text-[13px]">
          <summary className="min-h-8 cursor-pointer text-ink-muted">買うものを見る（{p.shopping.length} 点）</summary>
          <ul className="mt-1 flex flex-col gap-0.5 pl-1">
            {p.shopping.map((s) => (
              <li key={s.ingredientId}>
                {s.name} {s.packageLabel ? `${s.packageLabel} × ${s.packageCount}` : fmt(s.buyQuantity)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

const kitLocation = (p: ProposalView, recipeId: string) =>
  p.kitLocations.find((k) => k.recipeId === recipeId)?.location ?? 'fridge'

// ---------- 2. 提案から選ぶ ----------

/** 余りが大きいとき: 最良案の余り（冷蔵のみを先に）で AI に 1 品の下書きを作らせ、編集画面で確認して保存する */
function AiSuggest({ proposal }: { proposal: ProposalView | undefined }) {
  const suggest = useSuggestRecipe()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const leftovers = [...(proposal?.leftovers ?? [])].sort((a, b) => Number(b.perishable) - Number(a.perishable))

  async function onSuggest() {
    setError(null)
    try {
      const draft = await suggest.mutateAsync({
        // API は 30 件まで（優先順の先頭から）
        leftovers: leftovers.slice(0, 30).map((l) => ({ ingredientId: l.ingredientId, quantity: l.quantity })),
      })
      navigate('/recipes/new', { state: { draft, returnTo: '/plan' } })
    } catch (err) {
      setError(aiErrorMessage(err))
    }
  }

  return (
    <div className="flex flex-col gap-2 text-sm text-ink-soft">
      {leftovers.length === 0 ? (
        <p className="rounded-item bg-accent-wash px-4 py-3">
          登録レシピが少ないため、組み合わせの提案が出せませんでした。レシピを増やすと案が出ます。
        </p>
      ) : (
        <>
          <button
            type="button"
            onClick={onSuggest}
            disabled={suggest.isPending}
            className="flex min-h-13 items-center justify-center gap-2 rounded-control border border-accent-line bg-accent-wash px-4 text-sm font-bold text-accent-strong disabled:opacity-60"
          >
            <Icon name="sparkle" size={18} />
            {suggest.isPending ? 'AI が考えています…（1 分ほど）' : '余る食材で AI に 1 品提案してもらう'}
          </button>
          <p className="px-1 text-xs text-ink-muted">
            余りが出やすい組み合わせです（{leftovers.map((l) => l.name).join('、')}
            ）。下書きを確認して保存すると、提案を計算し直します
          </p>
        </>
      )}
      {error && <p className="text-danger">{error}</p>}
    </div>
  )
}

const proposalKey = (p: ProposalView) => p.recipes.map((r) => r.recipeId).join()

/** 食数。0.5 刻みなどの端数もそのまま出す */
function fmtServings(n: number): string {
  return String(Math.round(n * 10) / 10)
}

function Proposals({ plan, onChosen }: { plan: Plan; onChosen: () => void }) {
  const recs = useRecommendations(plan.id)
  const replace = useReplacePlanRecipes(plan.id)
  // 案はレシピの並びで持つ（計算し直して並びや件数が変わっても、選んだ案を取り違えない）
  const [pickedKey, setPickedKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const proposals = recs.data?.proposals ?? []
  const found = proposals.findIndex((p) => proposalKey(p) === pickedKey)
  const picked = found === -1 ? 0 : found
  const chosen = proposals[picked]

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
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-bold text-ink-muted">提案{proposals.length > 0 && `（${proposals.length}案）`}</h2>
        <p className="text-xs text-ink-muted">在庫と期限から計算</p>
      </div>
      {recs.isPending && <p className="text-ink-muted">計算中…</p>}
      {recs.isError && <p className="text-danger">{errorMessage(recs.error, '提案を出せませんでした')}</p>}
      <ol aria-label="提案" className="flex flex-col gap-3">
        {proposals.map((p, i) => {
          const on = i === picked
          const total = p.recipes.reduce((sum, r) => sum + r.servings, 0)
          return (
            <li key={proposalKey(p)}>
              {/* カード全体がラジオボタンのラベル。中の写真や「買うものを見る」を押しても案は切り替わらない */}
              <label
                className={`flex flex-col gap-3.5 rounded-card bg-surface p-4 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-accent ${
                  on
                    ? 'border-2 border-accent shadow-[0_6px_20px_rgba(179,58,10,0.10)]'
                    : 'cursor-pointer border-2 border-transparent'
                }`}
              >
                <input
                  type="radio"
                  name="proposal"
                  checked={on}
                  onChange={() => setPickedKey(proposalKey(p))}
                  aria-label={`案${i + 1}を選ぶ`}
                  className="sr-only"
                />
                <span className="flex items-center gap-2">
                  <span className="text-[15px] font-bold">案{i + 1}</span>
                  {i === 0 && (
                    <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent-strong">
                      おすすめ
                    </span>
                  )}
                  {on ? (
                    <span
                      aria-hidden="true"
                      className="ml-auto flex size-6 items-center justify-center rounded-full bg-accent text-white"
                    >
                      <Icon name="check" size={14} strokeWidth={2.8} />
                    </span>
                  ) : (
                    <span aria-hidden="true" className="ml-auto size-6 rounded-full border-2 border-line-strong" />
                  )}
                </span>
                <ul className="flex flex-col gap-2.5">
                  {p.recipes.map((r) => (
                    <li key={r.recipeId} className="flex items-center gap-3">
                      <DishPhotoButton recipeId={r.recipeId} title={r.title} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[15px] font-bold">{r.title}</span>
                        <span className="text-xs text-ink-muted">
                          {r.role === 'anchor' ? '選んだ料理' : '追加'} ・ {r.dayIndex}日目
                          {kitLocation(p, r.recipeId) === 'freezer' && ' ・ 冷凍'}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full bg-sunken px-3 py-1 text-sm font-bold text-ink-soft">
                        {fmtServings(r.servings)}食分
                      </span>
                    </li>
                  ))}
                </ul>
                <span className="-mt-1 text-right text-[13px] text-ink-soft">
                  合計 <span className="font-bold text-ink">{fmtServings(total)}食分</span>（{p.recipes.length}日分）
                </span>
                <EvaluationDetails p={p} />
              </label>
            </li>
          )
        })}
      </ol>
      {recs.data?.aiSuggestionRecommended && <AiSuggest proposal={recs.data.proposals[0]} />}
      {chosen && (
        <StickyAction hint="次に、食べる順と食数を決めます">
          {error && <p className="text-center text-sm text-danger">{error}</p>}
          <Button onClick={() => choose(chosen)} disabled={replace.isPending} className="min-h-13 w-full text-base">
            案{picked + 1}にする
          </Button>
        </StickyAction>
      )}
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
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-bold text-ink-muted">食べる順と食数</h2>
        <button type="button" onClick={onBack} disabled={busy} className="min-h-8 text-sm text-accent">
          提案を選び直す
        </button>
      </div>
      <ol className="divide-y divide-line-soft rounded-card bg-surface shadow-card">
        {rows.map((r, i) => (
          <li key={r.recipeId} className="px-3 py-3">
            <div className="flex items-center gap-2">
              <div className="flex shrink-0 flex-col">
                <button
                  type="button"
                  onClick={() => move(i, i - 1)}
                  disabled={busy || i === 0}
                  aria-label={`${r.title}を前の日へ`}
                  className="flex h-7 w-8 items-center justify-center text-ink-soft disabled:text-line-strong"
                >
                  <Icon name="chevronLeft" size={18} strokeWidth={2} className="rotate-90" />
                </button>
                <button
                  type="button"
                  onClick={() => move(i, i + 1)}
                  disabled={busy || i === rows.length - 1}
                  aria-label={`${r.title}を後の日へ`}
                  className="flex h-7 w-8 items-center justify-center text-ink-soft disabled:text-line-strong"
                >
                  <Icon name="chevronLeft" size={18} strokeWidth={2} className="-rotate-90" />
                </button>
              </div>
              <DishPhotoButton recipeId={r.recipeId} title={r.title} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                  {i + 1}日目（{shortDate(addDays(startsOn, i))}）
                  {ev && <LocationBadge location={kitLocation(ev, r.recipeId)} />}
                </div>
                <div className="truncate font-bold">{r.title}</div>
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => save(rows.filter((x) => x.recipeId !== r.recipeId))}
                    disabled={busy}
                    className="min-h-7 text-xs text-danger"
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
        className={inputClass}
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

      <div className="rounded-card bg-surface shadow-card p-4">
        {evaluation.isPending && <p className="text-sm text-ink-muted">計算中…</p>}
        {evaluation.isError && <p className="text-sm text-danger">計算できませんでした</p>}
        {ev && <EvaluationDetails p={ev} />}
      </div>

      <label className="block text-sm font-bold text-ink-soft">
        1日目
        <input
          type="date"
          value={startsOn}
          min={todayJst()}
          onChange={(e) => setStartsOn(e.target.value)}
          className={inputClass}
        />
      </label>
      <StickyAction hint="確定すると買い物リストを作ります">
        {error && <p className="text-center text-sm text-danger">{error}</p>}
        <Button onClick={onConfirm} disabled={busy || !startsOn} className="min-h-13 w-full text-base">
          {confirm.isPending ? '確定しています…' : 'この献立で確定'}
        </Button>
      </StickyAction>
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

  /** 食べたい料理を 1 つ外して、提案を計算し直す。最後の 1 品を外したら献立ごとやめて、料理を選ぶところに戻る */
  function removeAnchor(recipeId: string) {
    if (anchors.length <= 1) return discard.mutate(plan.id)
    replace.mutate({
      recipes: anchors
        .filter((r) => r.recipeId !== recipeId)
        .map((r, i) => ({ recipeId: r.recipeId, role: r.role, servings: r.servings, dayIndex: i + 1 })),
    })
  }

  return (
    <>
      {step === 'proposals' ? (
        <>
          <section className="mb-5 flex flex-col gap-2.5">
            <h2 className="text-sm font-bold text-ink-muted">食べたい料理</h2>
            <ul className="flex flex-wrap gap-2">
              {anchors.map((r) => (
                <li
                  key={r.recipeId}
                  className="flex min-h-10 items-center gap-1 rounded-full bg-ink pr-1.5 pl-3.5 text-sm font-bold text-white"
                >
                  {r.title}（{r.servings}食）
                  <button
                    type="button"
                    onClick={() => removeAnchor(r.recipeId)}
                    disabled={replace.isPending || discard.isPending}
                    aria-label={`${r.title}を外す`}
                    className="flex size-8 items-center justify-center rounded-full disabled:opacity-50"
                  >
                    <Icon name="close" size={14} strokeWidth={2.4} />
                  </button>
                </li>
              ))}
            </ul>
            {(replace.isError || discard.isError) && (
              <p className="text-sm text-danger">{errorMessage(replace.error ?? discard.error, '外せませんでした')}</p>
            )}
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
      {/* 買い物中は料理名をリストの上に出す（案D） */}
      {plan.status !== 'prepping' && plan.status !== 'shopping' && (
        <ol className="mb-5 divide-y divide-line-soft rounded-card bg-surface shadow-card px-4">
          {rows.map((r) => (
            <li key={r.recipeId} className="flex items-center gap-3 py-3">
              <DishPhotoButton recipeId={r.recipeId} title={r.title} />
              <div className="min-w-0">
                <div className="text-xs text-ink-muted">
                  {r.dayIndex}日目{plan.startsOn && `（${shortDate(addDays(plan.startsOn, r.dayIndex - 1))}）`}
                </div>
                <div className="font-bold">
                  {r.title} <span className="text-sm font-normal text-ink-muted">{r.servings}食</span>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
      {plan.status === 'shopping' && <ShoppingListView planId={plan.id} dishes={rows.map((r) => r.title)} />}
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

const TITLES = { draft: '献立を組む', shopping: '買い物リスト', prepping: '下ごしらえと袋詰め' } as const

export function PlanPage() {
  const current = useCurrentPlan()
  const plan = current.data
  const status = plan?.status
  const title = status === 'shopping' || status === 'prepping' ? TITLES[status] : TITLES.draft
  return (
    <>
      <PageHeader title={title} meta={status && PLAN_STATUS_LABELS[status]} backTo="/" />
      {/* 下ごしらえ中は下ごしらえ → 袋詰めの中で進み具合を出す */}
      {current.isSuccess && status !== 'prepping' && (
        <PlanProgress current={status === 'shopping' ? 'shopping' : 'plan'} />
      )}
      {current.isPending && <p className="text-ink-muted">読み込み中…</p>}
      {current.isError && <p className="text-danger">読み込めませんでした</p>}
      {current.isSuccess &&
        (plan === null || plan === undefined ? (
          <AnchorPicker />
        ) : plan.status === 'draft' ? (
          <DraftPlan key={plan.id} plan={plan} />
        ) : (
          <ConfirmedPlan plan={plan} />
        ))}
    </>
  )
}
