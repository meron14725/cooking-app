import { daysLeftLabel, type ExpiryStatus } from '../../shared/domain/expiry'

const styles: Record<ExpiryStatus, string> = {
  expired: 'bg-danger-soft text-danger',
  soon: 'bg-warn-soft text-warn',
  ok: 'bg-leaf-soft text-leaf',
}

export function ExpiryBadge({ daysLeft, status }: { daysLeft: number; status: ExpiryStatus }) {
  return (
    <span className={`shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-bold ${styles[status]}`}>
      {daysLeftLabel(daysLeft)}
    </span>
  )
}
