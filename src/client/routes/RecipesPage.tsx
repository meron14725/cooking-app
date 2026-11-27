import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import type { RecipeSort } from '../../shared/schemas/recipe'
import { aiErrorMessage, useDraftRecipe, useRecipes } from '../api/recipes'
import { Icon } from '../components/Icon'
import { RecipePhoto } from '../components/RecipePhoto'

/** 並べ替えの選択肢。足すときはここに 1 行（サーバーの sort もあわせて足す） */
const SORT_OPTIONS: { value: RecipeSort | ''; label: string }[] = [
  { value: '', label: '料理名' },
  { value: 'popular', label: 'お気に入り数' },
  { value: 'cooked', label: '作った回数' },
]

/** 1万以上は「1.2万」のように縮める */
function compactCount(n: number): string {
  return n >= 10_000 ? `${Math.round(n / 1_000) / 10}万` : n.toLocaleString('ja-JP')
}

function SortMenu({ value, onChange }: { value: RecipeSort | ''; onChange: (v: RecipeSort | '') => void }) {
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

/** 「＋」で開くパネル。URL・メモ・料理名など何でも AI に送り、できた下書きを確認画面で開く */
function AddSheet({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const draft = useDraftRecipe()
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)

  function close() {
    // 待っている途中で閉じたら取りやめる
    abort.current?.abort()
    onClose()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  async function send() {
    if (!text.trim()) return setError('送る内容を入れてください')
    setError(null)
    const controller = new AbortController()
    abort.current = controller
    try {
      const result = await draft.mutateAsync({ text, signal: controller.signal })
      navigate('/recipes/new', { state: { draft: result } })
    } catch (err) {
      if (controller.signal.aborted) return
      setError(aiErrorMessage(err))
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex flex-col justify-end">
      <button type="button" aria-label="閉じる" onClick={close} className="absolute inset-0 bg-ink/35" />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-sheet-title"
        className="relative mx-auto flex w-full max-w-md flex-col gap-3.5 rounded-t-[32px] bg-ground px-5 pt-3 pb-[calc(32px+env(safe-area-inset-bottom))]"
      >
        <span aria-hidden="true" className="h-1.5 w-10 self-center rounded-full bg-line-strong" />
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Icon name="sparkle" size={18} />
          </span>
          <h2 id="add-sheet-title" className="text-xl font-bold">
            レシピを追加
          </h2>
        </div>
        {draft.isPending ? (
          <>
            <div className="flex flex-col gap-2.5 rounded-item bg-surface p-4.5">
              <p className="text-base font-bold">AI がまとめています…</p>
              <p className="text-[13px] leading-relaxed text-ink-soft">
                できたら確認画面を開きます。材料や量はそこで直してから保存できます。数十秒かかることがあります。
              </p>
              <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-sunken">
                <div className="h-full w-2/5 animate-pulse rounded-full bg-accent-line" />
              </div>
            </div>
            <button
              type="button"
              onClick={close}
              className="min-h-13 rounded-full bg-surface text-[15px] font-bold shadow-card"
            >
              やめる
            </button>
          </>
        ) : (
          <>
            <p className="text-sm leading-relaxed text-ink-soft">
              URL、メモ、作りたい料理の名前など、なんでも送ってください。AI
              が材料・手順・ホットクックの設定にまとめます。
            </p>
            <label className="flex">
              <span className="sr-only">AI に送る内容</span>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                maxLength={4000}
                // biome-ignore lint/a11y/noAutofocus: パネルを開いたらすぐ書けるように
                autoFocus
                placeholder="例：https://… / 鶏ももとキャベツで何か / 祖母の筑前煮のメモ"
                className="flex-1 resize-none rounded-[22px] border border-transparent bg-surface px-4 py-3.5 text-base leading-relaxed shadow-card placeholder:text-ink-muted focus:border-accent focus:ring-2 focus:ring-accent-line focus:outline-none"
              />
            </label>
            {error && <p className="text-sm text-danger">{error}</p>}
            <button
              type="button"
              onClick={send}
              className="flex min-h-14 items-center justify-center gap-2 rounded-full bg-accent text-base font-bold text-white shadow-accent"
            >
              <Icon name="arrowUp" size={18} strokeWidth={2.2} />
              AI に送る
            </button>
            <Link
              to="/recipes/new"
              className="flex min-h-10 items-center justify-center text-sm font-medium text-accent"
            >
              AI を使わずに手で入力する
            </Link>
          </>
        )}
      </section>
    </div>
  )
}

export function RecipesPage() {
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<RecipeSort | ''>('')
  const [adding, setAdding] = useState(false)
  const { data, isPending, isError } = useRecipes({ q: q.trim() || undefined, sort: sort || undefined })

  return (
    <>
      <header className="mb-4 flex items-end justify-between">
        <h1 className="text-[26px] font-bold tracking-[0.02em]">レシピ</h1>
        {data && <p className="text-[13px] text-ink-muted">{data.length}品</p>}
      </header>

      <div className="flex flex-col gap-3.5">
        <label className="flex min-h-12 items-center gap-2.5 rounded-full border border-transparent bg-surface px-4 shadow-card focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-line">
          <Icon name="search" className="text-ink-muted" />
          <span className="sr-only">レシピを探す</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="料理名・食材で探す"
            className="min-w-0 flex-1 bg-transparent py-2.5 text-base placeholder:text-ink-muted focus:outline-none"
          />
        </label>

        <div className="flex gap-2">
          <SortMenu value={sort} onChange={setSort} />
          {/* 絞り込みは見た目だけ（中身はあとで） */}
          <button
            type="button"
            disabled
            title="準備中"
            className="flex min-h-10 items-center gap-1.5 rounded-full bg-surface pr-3.5 pl-3 text-[13px] font-bold text-ink shadow-card disabled:opacity-100"
          >
            <Icon name="filter" size={16} strokeWidth={2} />
            絞り込み
          </button>
        </div>

        {isPending && <p className="text-ink-muted">読み込み中…</p>}
        {isError && <p className="text-danger">読み込めませんでした</p>}
        {data && data.length === 0 && (
          <p className="py-4 text-center text-sm text-ink-muted">
            {q.trim() ? '見つかりませんでした' : 'まだレシピがありません。右下の＋から足せます'}
          </p>
        )}

        {data && data.length > 0 && (
          <ul className="flex flex-col gap-2.5">
            {data.map((r) => (
              <li key={r.id}>
                <Link
                  to={`/recipes/${r.id}`}
                  className="flex items-center gap-3.5 rounded-item bg-surface py-3.5 pr-4 pl-3.5 shadow-card"
                >
                  <RecipePhoto imageKey={r.imageKey} className="size-16 rounded-[18px]" />
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="truncate text-base font-bold">{r.title}</span>
                    <span className="truncate text-xs text-ink-muted">
                      {[
                        r.hotcookMode,
                        r.caloriesKcal !== null && `${r.caloriesEstimated ? '約' : ''}${r.caloriesKcal}kcal`,
                      ]
                        .filter(Boolean)
                        .join(' ・ ') || ' '}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs whitespace-nowrap text-ink-soft">
                      {r.favoriteCount !== null && (
                        <span className="flex items-center gap-1">
                          <Icon name="heart" size={14} strokeWidth={1.6} className="fill-[#e07a5f] text-[#e07a5f]" />
                          <span className="sr-only">お気に入り</span>
                          {compactCount(r.favoriteCount)}
                        </span>
                      )}
                      {r.cookCount !== null && <span>作った {compactCount(r.cookCount)}回</span>}
                      {r.packSeasonings && (
                        <span className="rounded-full bg-frozen-soft px-2 py-0.5 text-[11px] font-bold text-frozen">
                          下味冷凍
                        </span>
                      )}
                      <span className="text-ink-muted">{r.servings}人前</span>
                    </span>
                  </span>
                  <Icon name="chevronRight" size={18} strokeWidth={2} className="text-ink-muted" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        aria-label="レシピを追加（AI にまとめてもらう）"
        onClick={() => setAdding(true)}
        className="fixed right-[max(20px,calc(50%-14rem+20px))] bottom-[calc(var(--tabbar-h)+16px+env(safe-area-inset-bottom))] z-10 flex size-16 items-center justify-center rounded-full bg-accent text-white shadow-[0_10px_24px_rgba(179,58,10,0.35)]"
      >
        <Icon name="plus" size={28} strokeWidth={2.4} />
      </button>

      {adding && <AddSheet onClose={() => setAdding(false)} />}
    </>
  )
}
