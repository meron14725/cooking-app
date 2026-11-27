/** どれか 1 つを選ぶ切り替え（デザインの溝のあるセグメント。冷蔵庫の保存場所、レシピの並べ替え） */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T | ''
  options: { value: T | ''; label: string }[]
  onChange: (v: T | '') => void
  label: string
}) {
  return (
    <fieldset
      className="grid gap-1 rounded-control bg-sunken p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <legend className="sr-only">{label}</legend>
      {options.map((o) => {
        const on = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={on}
            className={`min-h-10 rounded-[10px] text-sm ${
              on ? 'bg-surface font-bold text-ink shadow-[0_1px_2px_rgba(60,40,20,0.12)]' : 'font-medium text-ink-soft'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </fieldset>
  )
}
