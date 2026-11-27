import type { ReactNode } from 'react'

/** 画面の下（タブバーの上）に貼りつく決定ボタンの帯 */
export function StickyAction({ hint, children }: { hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="sticky bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] -mx-5 mt-6 flex flex-col gap-1.5 bg-ground/95 px-5 pt-3 pb-3 backdrop-blur">
      {hint && <p className="text-center text-xs text-ink-muted">{hint}</p>}
      {children}
    </div>
  )
}
