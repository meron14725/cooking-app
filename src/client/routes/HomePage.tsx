import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { shortDate, todayJst } from '../../shared/domain/date'
import { locationLabel } from '../../shared/schemas/ingredient'
import type { MealKit } from '../../shared/schemas/kit'
import { PLAN_STATUS_LABELS } from '../../shared/schemas/plan'
import { apiFetch } from '../api/client'
import { useFridge } from '../api/inventory'
import { useCookView, useKits } from '../api/mealKits'
import { useCurrentPlan } from '../api/plans'
import { ExpiryBadge } from '../components/ExpiryBadge'
import { Icon } from '../components/Icon'
import { LocationBadge } from '../components/LocationBadge'
import { PageHeader } from '../components/PageHeader'

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
      <h2 className="text-sm font-bold text-ink-muted">{title}</h2>
      {link && (
        <Link to={link.to} className="flex min-h-8 items-center text-sm text-accent">
          {link.label}
        </Link>
      )}
    </div>
  )
}

function ExpiringSoon() {
  const { data, isPending, isError } = useFridge({ expiringSoon: true })
  return (
    <section className="flex flex-col gap-2.5">
      <SectionHeading title="期限が近いもの" link={{ to: '/fridge', label: '冷蔵庫を見る' }} />
      {isPending && <p className="text-sm text-ink-muted">読み込み中…</p>}
      {isError && <p className="text-sm text-danger">読み込めませんでした</p>}
      {data && data.length === 0 && <p className="text-sm text-ink-muted">期限が近いものはありません</p>}
      {data && data.length > 0 && (
        <ul className="divide-y divide-line-soft rounded-card bg-surface shadow-card px-4">
          {data.slice(0, EXPIRING_LIMIT).map((e) => (
            <li key={`${e.kind}-${e.id}`} className="flex items-center gap-3 py-3.5">
              {e.kind === 'meal_kit' && (
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
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

/** 今日の袋 1 つ分のカード。ホットクックの設定と直前作業は調理画面と同じデータから出す */
function TodayKitCard({ kit }: { kit: MealKit }) {
  const { data: cook } = useCookView(kit.id)
  const overdue = kit.plannedOn < todayJst()
  const beforeCook = cook?.beforeCook ?? []
  return (
    <div className="flex flex-col gap-4 rounded-card border-[1.5px] border-accent-line bg-surface p-5 shadow-[0_1px_2px_rgba(60,40,20,0.05)]">
      <div className="flex items-center gap-1.5">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${overdue ? 'bg-danger-soft text-danger' : 'bg-accent-soft text-accent-strong'}`}
        >
          {overdue ? '予定日を過ぎています' : '今日'}
        </span>
        <LocationBadge location={kit.location} />
        <span className="ml-auto text-xs text-ink-muted">{kit.servings}食分</span>
      </div>
      <div className="flex items-center gap-3.5">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <Icon name="bag" size={28} strokeWidth={1.6} />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-2xl leading-snug font-bold">{kit.title}</p>
          {cook?.hotcookMode && <p className="text-[13px] text-ink-muted">{cook.hotcookMode}</p>}
        </div>
      </div>
      {beforeCook.length > 0 && (
        <div className="flex items-center gap-2.5 rounded-xl bg-ground px-3.5 py-3">
          <Icon name="clock" size={18} className="text-ink-muted" />
          <p className="min-w-0 text-sm">
            直前作業 {beforeCook.length}件：
            <span className="font-bold">
              {beforeCook[0]?.name} ・ {beforeCook[0]?.task}
            </span>
            {beforeCook.length > 1 && ' ほか'}
          </p>
        </div>
      )}
      <Link
        to={`/kits/${kit.id}/cook`}
        className="flex min-h-13 items-center justify-center gap-1.5 rounded-control bg-accent text-base font-bold text-white"
      >
        作る
        <Icon name="chevronRight" size={18} strokeWidth={2} />
      </Link>
    </div>
  )
}

function TodayKits() {
  const { data } = useKits({ plannedOnOrBefore: todayJst() })
  if (!data || data.length === 0) return null
  return (
    <section className="flex flex-col gap-2.5">
      <SectionHeading title="今日はこの袋" />
      {data.map((k) => (
        <TodayKitCard key={k.id} kit={k} />
      ))}
    </section>
  )
}

/** 保存中の袋（食べる予定日の順）。今日の分は上のカードと同じものに「今日」と付ける */
function StoredKits() {
  const { data } = useKits()
  if (!data || data.length === 0) return null
  const today = todayJst()
  const kits = [...data].sort((a, b) => a.plannedOn.localeCompare(b.plannedOn))
  return (
    <section className="flex flex-col gap-2.5">
      <SectionHeading title="保存中の袋" />
      <ul className="divide-y divide-line-soft rounded-card bg-surface shadow-card px-4">
        {kits.map((k, i) => {
          const isToday = k.plannedOn <= today
          return (
            <li key={k.id}>
              <Link to={`/kits/${k.id}/cook`} className="flex min-h-13 items-center gap-3 py-3">
                <span
                  className={`flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-[13px] font-bold ${
                    isToday ? 'border-accent text-accent' : 'border-line-strong text-ink-muted'
                  }`}
                >
                  {i + 1}
                </span>
                <span className={`min-w-0 flex-1 truncate text-[15px] ${isToday ? 'font-bold' : ''}`}>{k.title}</span>
                {k.plannedOn < today ? (
                  <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-bold text-danger">
                    {shortDate(k.plannedOn)} ・ 過ぎています
                  </span>
                ) : isToday ? (
                  <span className="text-xs font-bold text-accent-strong">今日</span>
                ) : k.location === 'freezer' ? (
                  <span className="rounded-full bg-frozen-soft px-2 py-0.5 text-xs text-frozen">
                    冷凍 ・ {shortDate(k.plannedOn)}
                  </span>
                ) : (
                  <span className="text-xs text-ink-muted">{shortDate(k.plannedOn)}</span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function PlanLink() {
  const { data: plan } = useCurrentPlan()
  if (plan) {
    return (
      <Link
        to="/plan"
        className="flex min-h-13 items-center justify-center gap-1.5 rounded-control border border-accent-line bg-accent-wash font-bold text-accent-strong"
      >
        献立の続き（{PLAN_STATUS_LABELS[plan.status]}）
        <Icon name="chevronRight" size={18} strokeWidth={2} />
      </Link>
    )
  }
  return (
    <Link
      to="/plan"
      className="flex min-h-13 items-center justify-center gap-1.5 rounded-control border border-dashed border-line-dashed font-bold text-ink-soft"
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
      <PageHeader
        title="ホーム"
        eyebrow={longDate(todayJst())}
        action={
          <Link
            to="/agent"
            aria-label="AI に頼む"
            className="flex size-11 items-center justify-center rounded-full bg-surface shadow-card text-accent"
          >
            <Icon name="sparkles" />
          </Link>
        }
      />
      <div className="flex flex-col gap-7">
        <TodayKits />
        <PlanLink />
        <StoredKits />
        <ExpiringSoon />
      </div>
      <p className="mt-7 text-xs text-ink-muted">
        API: {health.isPending ? '確認中…' : health.isError ? '接続できません' : `OK（${health.data.today}）`}
      </p>
    </>
  )
}
