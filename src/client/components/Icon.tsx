import type { ReactNode } from 'react'

/**
 * 線のアイコン（デザインキャンバス「cooking-app デザイン」から）。色は currentColor。
 * 飾りなので aria-hidden。意味を伝えるときはボタン側に aria-label か文字を付ける。
 */
const ICONS = {
  home: <path d="M3.5 10.5 12 3.5l8.5 7V20a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1z" strokeLinejoin="round" />,
  fridge: (
    <>
      <rect x="5" y="2.5" width="14" height="19" rx="2.5" />
      <path d="M5 10h14M9 5.5v2M9 13v3" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="4.5" width="17" height="16" rx="2.5" />
      <path d="M3.5 9.5h17M8 2.5v4M16 2.5v4" />
    </>
  ),
  book: (
    <g strokeLinejoin="round">
      <path d="M4 5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2z" />
      <path d="M4 20a1 1 0 0 0 1 1h14v-3" />
    </g>
  ),
  more: (
    <g fill="currentColor" stroke="none">
      <circle cx="5.5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="18.5" cy="12" r="1.6" />
    </g>
  ),
  sparkle: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" strokeLinejoin="round" />,
  sparkles: (
    <g strokeLinejoin="round">
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
      <path d="M19 16v4M17 18h4" />
    </g>
  ),
  bag: (
    <g strokeLinejoin="round">
      <path d="M5 8h14l-1 12.5a1 1 0 0 1-1 .9H7a1 1 0 0 1-1-.9z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </g>
  ),
  /** 冷蔵（温度計） */
  chilled: (
    <>
      <path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z" />
      <path d="M12 10v6" />
    </>
  ),
  /** 冷凍（雪の結晶） */
  frozen: <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 6l2.5-1.5M9.5 19.5 12 18l2.5 1.5" />,
  /** 常温（箱） */
  pantry: (
    <g strokeLinejoin="round">
      <path d="M3.5 8 12 4l8.5 4v9L12 21l-8.5-4z" />
      <path d="M3.5 8 12 12l8.5-4M12 12v9" />
    </g>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </>
  ),
  pencil: (
    <g strokeLinejoin="round">
      <path d="M3.5 20.5 17 7a2.5 2.5 0 0 1 3.5 3.5L11 20.5z" />
      <path d="M3.5 20.5h7.5" />
    </g>
  ),
  warning: (
    <g strokeLinejoin="round">
      <path d="M12 3.5 2.5 20h19z" />
      <path d="M12 10v4M12 17h.01" />
    </g>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinejoin="round" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  chevronLeft: <path d="m15 18-6-6 6-6" strokeLinejoin="round" />,
  chevronRight: <path d="m9 18 6-6-6-6" strokeLinejoin="round" />,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" strokeLinejoin="round" />,
  arrowUp: <path d="M12 19V5M6 11l6-6 6 6" strokeLinejoin="round" />,
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m4 17.5 4.8-4.6a1 1 0 0 1 1.4 0l2.3 2.2 2.6-2.6a1 1 0 0 1 1.4 0l3.5 3.5" strokeLinejoin="round" />
    </>
  ),
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof ICONS

export function Icon({
  name,
  size = 20,
  strokeWidth = 1.8,
  className,
}: {
  name: IconName
  size?: number
  strokeWidth?: number
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
      className={className ? `shrink-0 ${className}` : 'shrink-0'}
    >
      {ICONS[name]}
    </svg>
  )
}
