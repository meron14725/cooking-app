import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { todayJst } from '../../shared/domain/date'
import { locationLabel } from '../../shared/schemas/ingredient'
import { PLAN_STATUS_LABELS } from '../../shared/schemas/plan'
import { apiFetch } from '../api/client'
import { useFridge } from '../api/inventory'
import { useKits } from '../api/mealKits'
import { useCurrentPlan } from '../api/plans'
import { ExpiryBadge } from '../components/ExpiryBadge'
import { PageHeader } from '../components/PageHeader'

/** ホームに出す期限間近の件数 */
const EXPIRING_LIMIT = 5

function ExpiringSoon() {
  const { data, isPending, isError } = useFridge({ expiringSoon: true })
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-bold text-stone-500">期限が近いもの</h2>
        <Link to="/fridge" className="text-sm text-orange-700">
          冷蔵庫を見る
        </Link>
      </div>
      {isPending && <p className="text-sm text-stone-500">読み込み中…</p>}
      {isError && <p className="text-sm text-red-600">読み込めませんでした</p>}
      {data && data.length === 0 && <p className="text-sm text-stone-500">期限が近いものはありません</p>}
      {data && data.length > 0 && (
        <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
          {data.slice(0, EXPIRING_LIMIT).map((e) => (
            <li key={`${e.kind}-${e.id}`} className="flex items-center justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate font-bold">
                  {e.kind === 'meal_kit' && <span className="mr-1">🛍️</span>}
                  {e.name}
                </div>
                <div className="text-xs text-stone-500">
                  {locationLabel(e.location)}
                  {e.quantityText && ` ・ ${e.quantityText}`}
                  {e.reservedFor && ` ・ ${e.reservedFor}`}
                </div>
              </div>
              <ExpiryBadge daysLeft={e.daysLeft} status={e.expiryStatus} />
            </li>
          ))}
        </ul>
      )}
      {data && data.length > EXPIRING_LIMIT && (
        <p className="mt-1 text-right text-xs text-stone-500">ほか {data.length - EXPIRING_LIMIT} 件</p>
      )}
    </section>
  )
}

function TodayKits() {
  const { data } = useKits({ plannedOnOrBefore: todayJst() })
  if (!data || data.length === 0) return null
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-bold text-stone-500">今日はこの袋</h2>
      <ul className="space-y-2">
        {data.map((k) => (
          <li key={k.id}>
            <Link
              to={`/kits/${k.id}/cook`}
              className="flex items-center justify-between gap-2 rounded-xl border-2 border-orange-300 bg-orange-50 px-4 py-3"
            >
              <span className="min-w-0">
                <span className="block truncate text-lg font-bold">🛍️ {k.title}</span>
                <span className="text-xs text-stone-600">
                  {k.location === 'freezer' ? '🧊 冷凍' : '❄️ 冷蔵'} ・ {k.servings}食分
                  {k.plannedOn < todayJst() && ' ・ 予定日を過ぎています'}
                </span>
              </span>
              <span className="shrink-0 font-bold text-orange-700">作る →</span>
            </Link>
          </li>
        ))}
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
        className="mb-4 flex min-h-11 items-center justify-center rounded-lg border border-orange-300 bg-white font-bold text-orange-700"
      >
        献立の続き（{PLAN_STATUS_LABELS[plan.status]}）
      </Link>
    )
  }
  return (
    <Link
      to="/plan"
      className="mb-4 flex min-h-11 items-center justify-center rounded-lg bg-orange-600 font-bold text-white"
    >
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
      <PageHeader title="ホーム" />
      <TodayKits />
      <PlanLink />
      <ExpiringSoon />
      <p className="mt-6 text-xs text-stone-400">
        API: {health.isPending ? '確認中…' : health.isError ? '接続できません' : `OK（${health.data.today}）`}
      </p>
    </>
  )
}
