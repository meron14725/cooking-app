import { useState } from 'react'
import { Link } from 'react-router'
import { SOURCE_TYPE_LABELS } from '../../shared/schemas/recipe'
import { useRecipes } from '../api/recipes'
import { Icon, type IconName } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'

function AddLink({ to, icon, label }: { to: string; icon: IconName; label: string }) {
  return (
    <Link
      to={to}
      className="flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-control border border-line-strong bg-surface text-sm font-bold text-ink"
    >
      <Icon name={icon} size={18} className="text-accent" />
      {label}
    </Link>
  )
}

export function RecipesPage() {
  const [q, setQ] = useState('')
  const { data, isPending, isError } = useRecipes({ q: q.trim() || undefined })

  return (
    <>
      <PageHeader title="レシピ" meta={data && `${data.length}品`} />

      <div className="flex flex-col gap-4">
        <label className="flex min-h-12 items-center gap-2.5 rounded-control border border-line-strong bg-surface px-3.5 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-line">
          <Icon name="search" className="text-ink-muted" />
          <span className="sr-only">料理名で探す</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="料理名で探す"
            className="min-w-0 flex-1 bg-transparent py-2.5 text-base placeholder:text-ink-muted focus:outline-none"
          />
        </label>

        <div className="flex gap-2.5">
          <AddLink to="/recipes/new" icon="pencil" label="手で登録" />
          <AddLink to="/recipes/import" icon="link" label="URL から取り込む" />
        </div>

        {isPending && <p className="text-ink-muted">読み込み中…</p>}
        {isError && <p className="text-danger">読み込めませんでした</p>}
        {data && data.length === 0 && (
          <p className="py-4 text-center text-sm text-ink-muted">
            {q.trim() ? '見つかりませんでした' : 'まだレシピがありません'}
          </p>
        )}

        {data && data.length > 0 && (
          <ul className="flex flex-col gap-2.5">
            {data.map((r) => (
              <li key={r.id}>
                <Link
                  to={`/recipes/${r.id}`}
                  className="flex items-center gap-3 rounded-[16px] border border-line bg-surface px-4 py-3.5"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate text-base font-bold">{r.title}</span>
                    <span className="truncate text-[13px] text-ink-muted">
                      {[
                        r.hotcookMode,
                        r.caloriesKcal !== null && `${r.caloriesEstimated ? '約' : ''}${r.caloriesKcal}kcal`,
                      ]
                        .filter(Boolean)
                        .join(' ・ ') || ' '}
                    </span>
                    <span className="truncate text-xs text-ink-muted">{r.ingredientNames.join('、')}</span>
                    <span className="mt-0.5 flex gap-1.5">
                      <span className="rounded-md bg-sunken px-2 py-0.5 text-[11px] font-medium text-ink-soft">
                        {r.servings}人前
                      </span>
                      <span className="rounded-md bg-sunken px-2 py-0.5 text-[11px] font-medium text-ink-soft">
                        {SOURCE_TYPE_LABELS[r.sourceType]}
                      </span>
                    </span>
                  </span>
                  <Icon name="chevronRight" strokeWidth={2.2} className="text-ink-muted" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
