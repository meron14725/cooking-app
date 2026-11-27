const STEPS = [
  { key: 'plan', label: '献立' },
  { key: 'shopping', label: '買い物' },
  { key: 'prep', label: '下ごしらえ' },
  { key: 'pack', label: '袋詰め' },
] as const

export type PlanStep = (typeof STEPS)[number]['key']

/** 献立 → 買い物 → 下ごしらえ → 袋詰め の進み具合（済み=緑、いま=オレンジ、まだ=灰） */
export function PlanProgress({ current }: { current: PlanStep }) {
  const at = STEPS.findIndex((s) => s.key === current)
  return (
    <ol aria-label="進み具合" className="mb-5 grid grid-cols-4 gap-1.5">
      {STEPS.map((s, i) => {
        const state = i < at ? 'done' : i === at ? 'current' : 'todo'
        return (
          <li key={s.key} aria-current={state === 'current' ? 'step' : undefined} className="flex flex-col gap-1.5">
            <span
              className={`h-2 rounded-full ${state === 'done' ? 'bg-leaf' : state === 'current' ? 'bg-accent' : 'bg-track'}`}
            />
            <span
              className={`text-[11px] ${
                state === 'done' ? 'text-leaf' : state === 'current' ? 'font-bold text-accent-strong' : 'text-ink-muted'
              }`}
            >
              {s.label}
              {state === 'done' && <span className="sr-only">（済み）</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
