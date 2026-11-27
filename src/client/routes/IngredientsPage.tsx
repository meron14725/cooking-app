import { useState } from 'react'
import { Link } from 'react-router'
import { CATEGORY_OPTIONS, type Category, type Ingredient, locationLabel } from '../../shared/schemas/ingredient'
import { useIngredients } from '../api/ingredients'
import { inputBaseClass } from '../components/form'
import { PageHeader } from '../components/PageHeader'

function shelfLife(i: Ingredient): string {
  const parts = [`冷蔵 ${i.fridgeDays}日`]
  if (i.canFreeze && i.freezerDays !== null) parts.push(`冷凍 ${i.freezerDays}日`)
  if (i.pantryDays !== null) parts.push(`常温 ${i.pantryDays}日`)
  return parts.join(' / ')
}

export function IngredientsPage() {
  const [q, setQ] = useState('')
  const [category, setCategory] = useState<Category | ''>('')
  const { data, isPending, isError } = useIngredients({ q: q.trim() || undefined, category: category || undefined })

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <PageHeader title="食材マスタ" />
        <Link to="/ingredients/new" className="min-h-11 rounded-lg bg-orange-600 px-4 py-2.5 font-bold text-white">
          ＋ 追加
        </Link>
      </div>

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

      {isPending && <p className="text-stone-500">読み込み中…</p>}
      {isError && <p className="text-red-600">読み込めませんでした</p>}
      {data && data.length === 0 && <p className="text-stone-500">見つかりませんでした</p>}

      {data &&
        CATEGORY_OPTIONS.map((cat) => {
          const items = data.filter((i) => i.category === cat.value)
          if (items.length === 0) return null
          return (
            <section key={cat.value} className="mb-6">
              <h2 className="mb-2 text-sm font-bold text-stone-500">{cat.label}</h2>
              <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
                {items.map((i) => (
                  <li key={i.id}>
                    <Link to={`/ingredients/${i.id}`} className="block px-4 py-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-bold">{i.name}</span>
                        <span className="shrink-0 text-xs text-stone-500">
                          {locationLabel(i.defaultLocation)}・{i.canFreeze ? '冷凍可' : '冷凍不可'}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-stone-500">
                        {i.isStaple ? '常備品' : shelfLife(i)}
                        {i.packageUnits.length > 0 && ` ・ ${i.packageUnits.map((u) => u.label).join('、')}`}
                      </div>
                      {i.beforeCookTask && (
                        <div className="mt-0.5 text-xs text-amber-700">直前: {i.beforeCookTask}</div>
                      )}
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
