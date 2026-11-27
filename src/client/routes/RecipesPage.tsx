import { useState } from 'react'
import { Link } from 'react-router'
import { SOURCE_TYPE_LABELS } from '../../shared/schemas/recipe'
import { useRecipes } from '../api/recipes'
import { inputBaseClass } from '../components/form'
import { PageHeader } from '../components/PageHeader'

export function RecipesPage() {
  const [q, setQ] = useState('')
  const { data, isPending, isError } = useRecipes({ q: q.trim() || undefined })

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <PageHeader title="レシピ" />
        <Link to="/recipes/new" className="min-h-11 rounded-lg bg-orange-600 px-4 py-2.5 font-bold text-white">
          ＋ 追加
        </Link>
      </div>

      <Link
        to="/recipes/import"
        className="mb-4 flex min-h-11 items-center justify-center rounded-lg border border-orange-300 bg-white font-bold text-orange-700"
      >
        🔗 URL から取り込む
      </Link>

      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="料理名で探す"
        aria-label="料理名で探す"
        className={`${inputBaseClass} mb-4 w-full`}
      />

      {isPending && <p className="text-stone-500">読み込み中…</p>}
      {isError && <p className="text-red-600">読み込めませんでした</p>}
      {data && data.length === 0 && (
        <p className="text-stone-500">{q.trim() ? '見つかりませんでした' : 'まだレシピがありません'}</p>
      )}

      {data && data.length > 0 && (
        <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
          {data.map((r) => (
            <li key={r.id}>
              <Link to={`/recipes/${r.id}`} className="block px-4 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-bold">{r.title}</span>
                  <span className="shrink-0 text-xs text-stone-500">
                    {r.caloriesKcal !== null && `${r.caloriesEstimated ? '約' : ''}${r.caloriesKcal}kcal`}
                  </span>
                </div>
                <div className="mt-0.5 line-clamp-1 text-xs text-stone-500">{r.ingredientNames.join('、')}</div>
                <div className="mt-0.5 text-xs text-stone-400">
                  {r.servings}人前 ・ {SOURCE_TYPE_LABELS[r.sourceType]}
                  {r.hotcookMode && ` ・ ${r.hotcookMode}`}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
