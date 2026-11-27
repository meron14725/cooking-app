import { useState } from 'react'
import { Link } from 'react-router'
import { representativeLabel } from '../../shared/domain/cost'
import {
  CATEGORY_OPTIONS,
  type Category,
  type Ingredient,
  locationLabel,
  type PriceFilter,
} from '../../shared/schemas/ingredient'
import { useIngredients } from '../api/ingredients'
import { inputBaseClass } from '../components/form'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'

function shelfLife(i: Ingredient): string {
  const parts = [`冷蔵 ${i.fridgeDays}日`]
  if (i.canFreeze && i.freezerDays !== null) parts.push(`冷凍 ${i.freezerDays}日`)
  if (i.pantryDays !== null) parts.push(`常温 ${i.pantryDays}日`)
  return parts.join(' / ')
}

const PRICE_FILTER_OPTIONS: { value: PriceFilter | ''; label: string }[] = [
  { value: '', label: 'すべて' },
  { value: 'missing', label: '価格未設定' },
  { value: 'stale', label: '価格が古い' },
]

function priceText(i: Ingredient): string {
  if (i.priceYen === null) return '価格未設定'
  return `${representativeLabel(i)} ${i.priceYen.toLocaleString('ja-JP')}円${i.priceSource === 'default' ? '（目安）' : ''}`
}

export function IngredientsPage() {
  const [q, setQ] = useState('')
  const [category, setCategory] = useState<Category | ''>('')
  const [price, setPrice] = useState<PriceFilter | ''>('')
  const { data, isPending, isError } = useIngredients({
    q: q.trim() || undefined,
    category: category || undefined,
    price: price || undefined,
  })

  return (
    <>
      <PageHeader
        title="食材マスタ"
        backTo="/more"
        action={
          <Link
            to="/ingredients/new"
            className="flex min-h-11 items-center gap-1 rounded-control bg-accent px-3.5 font-bold text-white"
          >
            <Icon name="plus" size={18} strokeWidth={2} />
            追加
          </Link>
        }
      />

      <div className="mb-4 flex gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="名前で探す"
          aria-label="名前で探す"
          className={`${inputBaseClass} min-w-0 flex-1`}
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as Category | '')}
          aria-label="売り場"
          className={`${inputBaseClass} w-32 shrink-0`}
        >
          <option value="">すべて</option>
          {CATEGORY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="-mt-2 mb-4 flex gap-2" aria-label="価格で絞り込む">
        {PRICE_FILTER_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={price === o.value}
            onClick={() => setPrice(o.value)}
            className={`min-h-9 rounded-full px-3 text-sm ${
              price === o.value ? 'bg-accent font-bold text-white' : 'bg-surface text-ink-soft shadow-card'
            }`}
          >
            {o.label}
          </button>
        ))}
      </fieldset>

      {isPending && <p className="text-ink-muted">読み込み中…</p>}
      {isError && <p className="text-danger">読み込めませんでした</p>}
      {data && data.length === 0 && <p className="text-ink-muted">見つかりませんでした</p>}

      {data &&
        CATEGORY_OPTIONS.map((cat) => {
          const items = data.filter((i) => i.category === cat.value)
          if (items.length === 0) return null
          return (
            <section key={cat.value} className="mb-6">
              <h2 className="mb-2 px-1 text-[13px] font-bold tracking-wide text-ink-muted">{cat.label}</h2>
              <ul className="divide-y divide-line-soft overflow-hidden rounded-card bg-surface shadow-card">
                {items.map((i) => (
                  <li key={i.id}>
                    <Link to={`/ingredients/${i.id}`} className="block px-4 py-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-bold">{i.name}</span>
                        <span className="shrink-0 text-xs text-ink-muted">
                          {locationLabel(i.defaultLocation)}・{i.canFreeze ? '冷凍可' : '冷凍不可'}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-ink-muted">
                        {i.isStaple ? '常備品' : shelfLife(i)}
                        {i.packageUnits.length > 0 && ` ・ ${i.packageUnits.map((u) => u.label).join('、')}`}
                      </div>
                      {!i.isStaple && <div className="mt-0.5 text-xs text-ink-muted">{priceText(i)}</div>}
                      {i.beforeCookTask && <div className="mt-0.5 text-xs text-warn">直前: {i.beforeCookTask}</div>}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
    </>
  )
}
