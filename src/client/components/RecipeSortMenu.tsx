import { useEffect, useRef, useState } from 'react'
import type { RecipeSort } from '../../shared/schemas/recipe'
import { Icon } from './Icon'

/** 並べ替えの選択肢。足すときはここに 1 行（サーバーの sort もあわせて足す） */
const SORT_OPTIONS: { value: RecipeSort | ''; label: string }[] = [
  { value: '', label: '料理名' },
  { value: 'popular', label: 'お気に入り数' },
  { value: 'cooked', label: '作った回数' },
]

/** レシピの並べ替えメニュー（レシピ一覧と、献立を組むの料理を選ぶ一覧） */
export function RecipeSortMenu({
  value,
  onChange,
}: {
  value: RecipeSort | ''
  onChange: (v: RecipeSort | '') => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])
  const current = SORT_OPTIONS.find((o) => o.value === value) ?? SORT_OPTIONS[0]
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-10 items-center gap-1.5 rounded-full bg-accent-soft pr-3.5 pl-3 text-[13px] font-bold text-accent-strong"
      >
        <Icon name="sort" size={16} strokeWidth={2} />
        <span className="sr-only">並べ替え: </span>
        {current?.label}順
        <Icon name="chevronDown" size={14} strokeWidth={2.2} />
      </button>
      {open && (
        <ul
          aria-label="並べ替え"
          className="absolute top-12 left-0 z-20 w-55 rounded-[20px] bg-surface p-1.5 shadow-[0_12px_32px_rgba(120,70,30,0.18)]"
        >
          {SORT_OPTIONS.map((o) => {
            const selected = o.value === value
            return (
              <li key={o.value}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    onChange(o.value)
                    setOpen(false)
                  }}
                  className={`flex min-h-11 w-full items-center justify-between rounded-[14px] px-3 text-sm ${
                    selected ? 'bg-accent-wash font-bold' : 'font-medium'
                  }`}
                >
                  {o.label}
                  {selected && <Icon name="check" size={16} strokeWidth={2.6} className="text-accent" />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** 絞り込みボタン。今は見た目だけ（中身はあとで） */
export function RecipeFilterButton() {
  return (
    <button
      type="button"
      disabled
      title="準備中"
      className="flex min-h-10 items-center gap-1.5 rounded-full bg-surface pr-3.5 pl-3 text-[13px] font-bold text-ink shadow-card disabled:opacity-100"
    >
      <Icon name="filter" size={16} strokeWidth={2} />
      絞り込み
    </button>
  )
}
