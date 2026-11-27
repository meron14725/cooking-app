import type { ReactNode } from 'react'

/** 入力欄の見た目（幅は含まない） */
export const inputBaseClass =
  'rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200 disabled:bg-stone-100 disabled:text-stone-400'

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
      <span className="mb-1 block text-sm font-bold text-stone-700">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
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
        className="size-5 accent-orange-600"
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
    primary: 'bg-orange-600 text-white disabled:bg-orange-300',
    secondary: 'border border-stone-300 bg-white text-stone-700',
    danger: 'border border-red-300 bg-white text-red-600',
  }[variant]
  return (
    <button
      type="button"
      {...props}
      className={`min-h-11 rounded-lg px-4 font-bold ${styles} ${props.className ?? ''}`}
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
