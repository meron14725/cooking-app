import { Link } from 'react-router'
import { Icon, type IconName } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'

const items: { to: string; label: string; description: string; icon: IconName }[] = [
  {
    to: '/agent',
    label: 'AI に頼む',
    description: '「玉ねぎを半分使った」などと書くと、在庫・レシピ・献立の変更案を出します',
    icon: 'sparkles',
  },
  {
    to: '/ingredients',
    label: '食材マスタ',
    description: '販売単位、冷凍できるか、日持ち、直前作業',
    icon: 'pantry',
  },
]

export function MorePage() {
  return (
    <>
      <PageHeader title="その他" />
      <ul className="divide-y divide-line-soft overflow-hidden rounded-card bg-surface shadow-card">
        {items.map((i) => (
          <li key={i.to}>
            <Link to={i.to} className="flex min-h-16 items-center gap-3 px-4 py-3.5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                <Icon name={i.icon} size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{i.label}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">{i.description}</span>
              </span>
              <Icon name="chevronRight" size={18} className="shrink-0 text-ink-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
