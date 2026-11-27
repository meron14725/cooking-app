import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import type { RecipeSummary } from '../../shared/schemas/recipe'
import { useRecipes } from '../api/recipes'
import { RecipePhoto } from './RecipePhoto'

/** レシピ一覧（キャッシュを共有）から 1 件引く。写真のキー・加熱の設定・カロリーを出すのに使う */
function useRecipeSummary(recipeId: string): RecipeSummary | undefined {
  const { data } = useRecipes()
  return useMemo(() => data?.find((r) => r.id === recipeId), [data, recipeId])
}

/** 加熱の設定とカロリー。例: 「手動 > 煮物を作る > まぜる > 25分 ・ 約380kcal」 */
function dishMeta(r: RecipeSummary | undefined): string {
  if (!r) return ''
  return [r.hotcookMode, r.caloriesKcal !== null && `${r.caloriesEstimated ? '約' : ''}${r.caloriesKcal}kcal`]
    .filter(Boolean)
    .join(' ・ ')
}

/**
 * 料理名の横に置く写真のサムネイル。押すと下から出るパネルで写真を大きく見せる。
 * カードの中に置いても、押したことはカードに伝えない（案を選んだりしない）
 */
export function DishPhotoButton({
  recipeId,
  title,
  className = 'size-10 rounded-[14px]',
}: {
  recipeId: string
  title: string
  className?: string
}) {
  const recipe = useRecipeSummary(recipeId)
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={`${title} の写真を見る`}
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
        onKeyDown={(e) => e.stopPropagation()}
        className="shrink-0 rounded-[14px]"
      >
        <RecipePhoto
          imageKey={recipe?.imageKey ?? null}
          className={`border-2 border-surface shadow-[0_2px_8px_rgba(120,70,30,0.15)] ${className}`}
        />
      </button>
      {open && (
        <DishPhotoSheet
          recipeId={recipeId}
          title={title}
          recipe={recipe}
          onClose={() => {
            setOpen(false)
            // 閉じたら押したサムネイルにフォーカスを戻す（キーボードで迷子にならないように）
            buttonRef.current?.focus()
          }}
        />
      )}
    </>
  )
}

/** 写真を大きく見せる下からのパネル（料理名・加熱の設定とカロリー・レシピを見る・閉じる） */
function DishPhotoSheet({
  recipeId,
  title,
  recipe,
  onClose,
}: {
  recipeId: string
  title: string
  recipe: RecipeSummary | undefined
  onClose: () => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
  const meta = dishMeta(recipe)
  // body に出す。React のイベントはポータルでも親へ伝わるので、カードに届かないよう止める
  return createPortal(
    // biome-ignore lint/a11y/noStaticElementInteractions: パネルの中の操作を下のカードに伝えないためだけ
    <div
      className="fixed inset-0 z-40 flex flex-col justify-end"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <button type="button" aria-label="閉じる" onClick={onClose} className="absolute inset-0 bg-ink/35" />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`${title} の写真`}
        className="relative mx-auto flex w-full max-w-md flex-col gap-4 rounded-t-[32px] bg-ground px-5 pt-3 pb-[calc(36px+env(safe-area-inset-bottom))]"
      >
        <span aria-hidden="true" className="h-1.25 w-10 self-center rounded-full bg-line-strong" />
        <RecipePhoto imageKey={recipe?.imageKey ?? null} className="h-60 w-full rounded-[28px]" />
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-2xl font-bold">{title}</h2>
            {meta && <p className="mt-1 text-[13px] text-ink-muted">{meta}</p>}
          </div>
          <Link
            to={`/recipes/${recipeId}`}
            className="flex min-h-11 shrink-0 items-center rounded-full bg-surface px-4 text-sm font-bold text-accent-strong shadow-card"
          >
            レシピを見る
          </Link>
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="min-h-13 rounded-full bg-sunken text-[15px] font-bold"
        >
          閉じる
        </button>
      </section>
    </div>,
    document.body,
  )
}
