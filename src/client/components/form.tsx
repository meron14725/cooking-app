import type { ReactNode } from 'react'

/** 入力欄の見た目（幅は含まない） */
export const inputBaseClass =
  'rounded-control border border-line-strong bg-surface px-3.5 py-2.5 text-base focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-line disabled:bg-sunken disabled:text-ink-muted'

export const inputClass = `w-full ${inputBaseClass}`

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string
  children: ReactNode
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: children に入力欄が入る
    <label className="block">
      <span className="mb-1 block text-sm font-bold text-ink-soft">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-ink-muted">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-danger">{error}</span>}
    </label>
  )
}

export function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex min-h-11 items-center gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-5 accent-accent"
      />
      <span>{label}</span>
    </label>
  )
}

export function Button({
  children,
  variant = 'primary',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  const styles = {
    primary: 'bg-accent text-white disabled:opacity-50',
    secondary: 'border border-line-strong bg-surface text-ink',
    danger: 'border border-danger/30 bg-surface text-danger',
  }[variant]
  return (
    <button
      type="button"
      {...props}
      className={`min-h-12 rounded-control px-4 font-bold ${styles} ${props.className ?? ''}`}
    >
      {children}
    </button>
  )
}

/** 数値の入力欄の値（空なら null） */
export function parseNumber(value: string): number | null {
  if (value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}
