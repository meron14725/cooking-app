import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { shortDate, todayJst } from '../../shared/domain/date'
import { splitHotcookMode } from '../../shared/domain/hotcook'
import { locationLabel } from '../../shared/schemas/ingredient'
import type { MealKit } from '../../shared/schemas/kit'
import { PLAN_STATUS_LABELS } from '../../shared/schemas/plan'
import { apiFetch } from '../api/client'
import { useFridge } from '../api/inventory'
import { useCookView, useKits } from '../api/mealKits'
import { useCurrentPlan } from '../api/plans'
import { useRecipe } from '../api/recipes'
import { ExpiryBadge } from '../components/ExpiryBadge'
import { Icon } from '../components/Icon'

/** ホームに出す期限間近の件数 */
const EXPIRING_LIMIT = 5

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

/** 2026-11-27 → 11月27日（金） */
function longDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const w = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1)).getUTCDay()
  return `${m}月${d}日（${WEEKDAYS[w]}）`
}

function SectionHeading({ title, link }: { title: string; link?: { to: string; label: string } }) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="text-lg font-bold">{title}</h2>
      {link && (
        <Link to={link.to} className="flex min-h-8 items-center text-sm font-medium text-accent">
          {link.label}
        </Link>
      )}
    </div>
  )
}

function ExpiringSoon() {
  const { data, isPending, isError } = useFridge({ expiringSoon: true })
  return (
    <section className="flex flex-col gap-3">
      <SectionHeading title="期限が近いもの" link={{ to: '/fridge', label: '冷蔵庫' }} />
      {isPending && <p className="text-sm text-ink-muted">読み込み中…</p>}
      {isError && <p className="text-sm text-danger">読み込めませんでした</p>}
      {data && data.length === 0 && <p className="text-sm text-ink-muted">期限が近いものはありません</p>}
      {data && data.length > 0 && (
        <ul className="divide-y divide-line-soft rounded-card bg-surface px-4.5 py-1 shadow-card">
          {data.slice(0, EXPIRING_LIMIT).map((e) => (
            <li key={`${e.kind}-${e.id}`} className="flex items-center gap-3 py-3.5">
              {e.kind === 'meal_kit' && (
                <span className="flex size-10 shrink-0 items-center justify-center rounded-[18px] bg-accent-soft text-accent">
                  <Icon name="bag" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold">{e.name}</p>
                <p className="mt-0.5 truncate text-xs text-ink-muted">
                  {e.kind === 'meal_kit' && '袋 ・ '}
                  {locationLabel(e.location)}
                  {e.quantityText && ` ・ ${e.quantityText}`}
                  {e.reservedFor && ` ・ ${e.reservedFor}`}
                </p>
              </div>
              <ExpiryBadge daysLeft={e.daysLeft} status={e.expiryStatus} />
            </li>
          ))}
        </ul>
      )}
      {data && data.length > EXPIRING_LIMIT && (
        <p className="text-right text-xs text-ink-muted">ほか {data.length - EXPIRING_LIMIT} 件</p>
      )}
    </section>
  )
}

/** 今日の袋 1 つ分のカード。加熱時間を大きく出す。ホットクックの設定と直前作業は調理画面と同じデータから出す */
function TodayKitCard({ kit, day }: { kit: MealKit; day: number | null }) {
  const { data: cook } = useCookView(kit.id)
  const { data: recipe } = useRecipe(kit.recipeId)
  const overdue = kit.plannedOn < todayJst()
  const beforeCook = cook?.beforeCook ?? []
  const { minutes, label } = splitHotcookMode(cook?.hotcookMode ?? null)
  return (
    <section
      aria-label="今日はこの袋"
      className="relative flex flex-col gap-4.5 overflow-hidden rounded-[32px] bg-accent-soft px-5.5 pt-6 pb-5.5"
    >
      <span aria-hidden="true" className="absolute -top-10 -right-10 size-40 rounded-full bg-[#ffd2b3]" />
      <div className="relative flex items-center justify-between gap-2">
        <p className={`text-[13px] font-bold ${overdue ? 'text-danger' : 'text-accent-strong'}`}>
          {overdue ? `${shortDate(kit.plannedOn)} の袋 ・ 予定日を過ぎています` : '今日はこの袋'}
          {!overdue && day !== null && ` ・ ${day}日目`}
        </p>
        <span
          className={`rounded-full bg-white/80 px-3 py-1 text-xs font-medium ${kit.location === 'freezer' ? 'text-frozen' : 'text-leaf'}`}
        >
          {kit.location === 'freezer' ? '冷凍' : '冷蔵'}
        </span>
      </div>
      <div className="relative flex items-end justify-between gap-3">
        <div className="min-w-0">
          <Link
            to={`/recipes/${kit.recipeId}`}
            className="inline-flex items-center gap-1 font-display text-[32px] leading-tight font-bold text-ink"
          >
            {kit.title}
            <Icon name="chevronRight" size={22} strokeWidth={2.2} className="shrink-0 opacity-60" />
          </Link>
          <p className="mt-1 text-sm text-ink-soft">
            {kit.servings}食分
            {recipe?.caloriesKcal != null && ` ・ ${recipe.caloriesEstimated ? '約' : ''}${recipe.caloriesKcal}kcal`}
          </p>
        </div>
        {minutes !== null && (
          <div className="shrink-0 text-right">
            <p className="font-display text-[46px] leading-none font-bold text-accent">
              {minutes}
              <span className="text-base text-ink-soft">分</span>
            </p>
            {label && <p className="mt-1 text-xs text-ink-soft">{label}</p>}
          </div>
        )}
      </div>
      {minutes === null && label && <p className="relative -mt-2 text-[13px] text-ink-soft">{label}</p>}
      {beforeCook.length > 0 && (
        <p className="relative rounded-[18px] bg-white/75 px-4 py-3 text-sm">
          先に{' '}
          <span className="font-bold">
            {beforeCook[0]?.name}を{beforeCook[0]?.task}
          </span>
          {beforeCook.length > 1 && ` ほか${beforeCook.length - 1}件`}
        </p>
      )}
      <Link
        to={`/kits/${kit.id}/cook`}
        className="relative flex min-h-14 items-center justify-center gap-1.5 rounded-full bg-accent text-[17px] font-bold text-white shadow-accent"
      >
        作りはじめる
        <Icon name="chevronRight" size={18} strokeWidth={2.2} />
      </Link>
    </section>
  )
}

/** この献立の袋（作ったもの＋保存中のもの）を食べる予定日の順に */
function usePlanKits() {
  const stored = useKits()
  const cooked = useKits({ status: 'cooked' })
  // 「この献立」は一番新しく袋詰めした献立（前の献立の冷凍袋が残っていても、新しい献立の進み具合を出す）
  const latest = [...(stored.data ?? [])].sort(
    (a, b) => b.packedOn.localeCompare(a.packedOn) || b.id.localeCompare(a.id),
  )[0]
  const planId = latest?.planId
  if (!stored.data || !planId) return { kits: [], stored: stored.data ?? [] }
  const kits = [...stored.data, ...(cooked.data ?? []).filter((k) => k.planId === planId)]
    .filter((k) => k.planId === planId)
    .sort((a, b) => a.plannedOn.localeCompare(b.plannedOn) || a.id.localeCompare(b.id))
  return { kits, stored: stored.data }
}

function TodayKits() {
  const { data } = useKits({ plannedOnOrBefore: todayJst() })
  const { kits } = usePlanKits()
  if (!data || data.length === 0) return null
  return (
    <>
      {data.map((k) => {
        const index = kits.findIndex((p) => p.id === k.id)
        return <TodayKitCard key={k.id} kit={k} day={index >= 0 ? index + 1 : null} />
      })}
    </>
  )
}

/** この献立の袋を横に並べた進み具合。作った袋はチェック、今日の袋は番号、冷凍の袋は雪のマーク */
function PlanKitsProgress() {
  const { kits } = usePlanKits()
  if (kits.length === 0) return null
  const today = todayJst()
  const currentId = kits.find((k) => k.status === 'stored')?.id
  return (
    <section className="flex flex-col gap-3.5">
      <SectionHeading title="この献立" />
      <ol className="flex items-start overflow-x-auto rounded-card bg-surface px-3 py-4.5 shadow-card">
        {kits.map((k, i) => {
          const done = k.status === 'cooked'
          const current = k.id === currentId
          return (
            <li key={k.id} className="flex min-w-21 flex-1 items-start">
              {i > 0 && <span aria-hidden="true" className="mt-[18px] h-[3px] w-6 shrink-0 rounded-full bg-track" />}
              <Link
                to={done ? '/fridge' : `/kits/${k.id}/cook`}
                aria-current={current ? 'step' : undefined}
                className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center"
              >
                {done ? (
                  <span className="flex size-10 items-center justify-center rounded-full bg-leaf-soft text-leaf">
                    <Icon name="check" size={18} strokeWidth={2.6} />
                    <span className="sr-only">作った</span>
                  </span>
                ) : current ? (
                  <span className="flex size-10 items-center justify-center rounded-full bg-accent font-display text-[17px] font-bold text-white ring-5 ring-accent-soft">
                    {i + 1}
                  </span>
                ) : k.location === 'freezer' ? (
                  <span className="flex size-10 items-center justify-center rounded-full bg-frozen-soft text-frozen">
                    <Icon name="frozen" size={18} strokeWidth={2} />
                    <span className="sr-only">冷凍</span>
                  </span>
                ) : (
                  <span className="flex size-10 items-center justify-center rounded-full bg-sunken font-display text-[17px] font-bold text-ink-soft">
                    {i + 1}
                  </span>
                )}
                <span className={`line-clamp-2 text-[13px] leading-snug ${current ? 'font-bold' : 'text-ink-muted'}`}>
                  {k.title}
                </span>
                {!done && (
                  <span className={`text-[11px] ${k.plannedOn < today ? 'font-bold text-danger' : 'text-ink-muted'}`}>
                    {k.plannedOn <= today
                      ? k.plannedOn < today
                        ? `${shortDate(k.plannedOn)} 過ぎ`
                        : '今日'
                      : shortDate(k.plannedOn)}
                  </span>
                )}
              </Link>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function PlanLink() {
  const { data: plan } = useCurrentPlan()
  if (plan) {
    return (
      <Link
        to="/plan"
        className="flex min-h-13 items-center justify-center gap-1.5 rounded-full bg-surface font-bold text-accent-strong shadow-card"
      >
        献立の続き（{PLAN_STATUS_LABELS[plan.status]}）
        <Icon name="chevronRight" size={18} strokeWidth={2} />
      </Link>
    )
  }
  return (
    <Link
      to="/plan"
      className="flex min-h-13 items-center justify-center gap-1.5 rounded-full border border-dashed border-line-dashed font-bold text-ink-soft"
    >
      <Icon name="plus" size={18} strokeWidth={2} />
      食べたい料理を選ぶ
    </Link>
  )
}

export function HomePage() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => apiFetch<{ ok: boolean; today: string }>('/health'),
  })

  return (
    <>
      <header className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-xl font-bold">{longDate(todayJst())}</h1>
        <Link
          to="/agent"
          aria-label="AI に頼む"
          className="flex size-12 items-center justify-center rounded-full bg-surface text-accent shadow-raised"
        >
          <Icon name="sparkle" size={22} />
        </Link>
      </header>
      <div className="flex flex-col gap-6.5">
        <TodayKits />
        <PlanKitsProgress />
        <PlanLink />
        <ExpiringSoon />
      </div>
      <p className="mt-7 text-xs text-ink-muted">
        API: {health.isPending ? '確認中…' : health.isError ? '接続できません' : `OK（${health.data.today}）`}
      </p>
    </>
  )
}
