import type { ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { Icon } from './Icon'

type Props = {
  title: string
  /** タイトルの上の小さな行（例: 日付） */
  eyebrow?: ReactNode
  /** タイトルの右に並べる補足（例: 件数） */
  meta?: ReactNode
  /** 右端の操作（アイコンボタンなど） */
  action?: ReactNode
  /**
   * 指定すると左上に戻るボタンを付けた小さな見出しにする（タブの一番上の画面以外）。
   * 戻るボタンはアプリの中の履歴で 1 つ前に戻り、履歴がない（直接開いた）ときだけここへ行く
   */
  backTo?: string
}

/**
 * 来た画面へ戻る関数。アプリの中から来たなら履歴で 1 つ前へ、直接開いた画面なら fallback へ。
 * 保存・削除のあとに一覧へ戻るときも、これを使うと戻るボタンで入力画面に戻ってしまわない
 */
export function useGoBack(fallback: string): () => void {
  const navigate = useNavigate()
  const location = useLocation()
  // 最初に開いた画面の key は default
  return () => (location.key === 'default' ? navigate(fallback, { replace: true }) : navigate(-1))
}

/** 左上の白い丸の戻るボタン */
export function BackButton({ fallback }: { fallback: string }) {
  const goBack = useGoBack(fallback)
  return (
    <Link
      to={fallback}
      aria-label="戻る"
      onClick={(e) => {
        e.preventDefault()
        goBack()
      }}
      className="mr-2 flex size-11 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-[0_2px_10px_rgba(120,70,30,0.10)]"
    >
      <Icon name="chevronLeft" size={22} strokeWidth={2} />
    </Link>
  )
}

/** 画面の見出し。タブの画面は大きな見出し、タブの外の画面は戻るボタン付き */
export function PageHeader({ title, eyebrow, meta, action, backTo }: Props) {
  if (backTo) {
    return (
      <header className="-mx-2 mb-4 flex items-center gap-1">
        <BackButton fallback={backTo} />
        <h1 className="min-w-0 flex-1 truncate font-display text-lg font-bold">{title}</h1>
        {meta && <div className="shrink-0 text-[13px] text-ink-muted">{meta}</div>}
        {action}
      </header>
    )
  }
  return (
    <header className="mb-5 flex items-end justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        {eyebrow && <p className="text-[13px] text-ink-muted">{eyebrow}</p>}
        <h1 className="text-[26px] font-bold tracking-[0.02em]">{title}</h1>
      </div>
      {meta && <div className="shrink-0 pb-1 text-[13px] text-ink-muted">{meta}</div>}
      {action && <div className="shrink-0 self-start">{action}</div>}
    </header>
  )
}
