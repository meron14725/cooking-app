import { daysLeftLabel, type ExpiryStatus } from '../../shared/domain/expiry'

const styles: Record<ExpiryStatus, string> = {
  expired: 'bg-red-100 text-red-700',
  soon: 'bg-amber-100 text-amber-800',
  ok: 'bg-stone-100 text-stone-600',
}

export function ExpiryBadge({ daysLeft, status }: { daysLeft: number; status: ExpiryStatus }) {
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${styles[status]}`}>
      {daysLeftLabel(daysLeft)}
    </span>
  )
}
