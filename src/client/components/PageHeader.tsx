import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Icon } from './Icon'

type Props = {
  title: string
  /** タイトルの上の小さな行（例: 日付） */
  eyebrow?: ReactNode
  /** タイトルの右に並べる補足（例: 件数） */
  meta?: ReactNode
  /** 右端の操作（アイコンボタンなど） */
  action?: ReactNode
  /** 指定すると戻るボタン付きの小さな見出しにする（タブの外の画面用） */
  backTo?: string
}

/** 画面の見出し。タブの画面は大きな見出し、タブの外の画面は戻るボタン付き */
export function PageHeader({ title, eyebrow, meta, action, backTo }: Props) {
  if (backTo) {
    return (
      <header className="-mx-2 mb-4 flex items-center gap-1">
        <Link to={backTo} aria-label="戻る" className="flex size-11 items-center justify-center rounded-full text-ink">
          <Icon name="chevronLeft" size={22} strokeWidth={2} />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-lg font-bold">{title}</h1>
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
