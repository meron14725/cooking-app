import { Link } from 'react-router'
import { PageHeader } from '../components/PageHeader'

const items = [{ to: '/ingredients', label: '食材マスタ', description: '販売単位、冷凍できるか、日持ち、直前作業' }]

export function MorePage() {
  return (
    <>
      <PageHeader title="その他" />
      <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
        {items.map((i) => (
          <li key={i.to}>
            <Link to={i.to} className="block px-4 py-3">
              <div className="font-bold">{i.label}</div>
              <div className="text-xs text-stone-500">{i.description}</div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
