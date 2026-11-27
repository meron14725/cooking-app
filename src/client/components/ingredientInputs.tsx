import { normalizeUnit, type UnitMaster } from '../../shared/domain/units'
import { CATEGORY_OPTIONS, type Ingredient } from '../../shared/schemas/ingredient'
import { inputBaseClass } from './form'

/** 量を入れられる単位: 基準単位、g（重さが分かる食材）、大さじ・小さじ（ml の食材） */
export function unitChoices(m: UnitMaster | undefined): string[] {
  if (!m) return []
  const base = normalizeUnit(m.unit)
  const choices = [m.unit]
  if (base !== 'g' && m.gramsPerUnit) choices.push('g')
  if (base === 'ml') choices.push('大さじ', '小さじ')
  return choices
}

/** 食材マスタから売り場ごとに選ぶ select。削除済みの食材を選んだままにしたいときは archivedName を渡す */
export function IngredientSelect({
  value,
  onChange,
  ingredients,
  archivedName,
  className = '',
}: {
  value: string
  onChange: (id: string) => void
  ingredients: Ingredient[]
  archivedName?: string
  className?: string
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="食材"
      className={`${inputBaseClass} min-w-0 ${className}`}
    >
      <option value="">食材を選ぶ</option>
      {archivedName && <option value={value}>{archivedName}（削除済み）</option>}
      {CATEGORY_OPTIONS.map((cat) => {
        const items = ingredients.filter((i) => i.category === cat.value)
        if (items.length === 0) return null
        return (
          <optgroup key={cat.value} label={cat.label}>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </optgroup>
        )
      })}
    </select>
  )
}
