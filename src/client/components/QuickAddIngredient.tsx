import { useState } from 'react'
import {
  CATEGORY_OPTIONS,
  type Category,
  type Ingredient,
  ingredientInputSchema,
} from '../../shared/schemas/ingredient'
import { ApiRequestError } from '../api/client'
import { useSaveIngredient } from '../api/ingredients'
import { Button, Checkbox, inputBaseClass, inputClass, parseNumber } from './form'

/**
 * URL 取り込みでマスタにない食材を、その場で食材マスタに足す小さなフォーム。
 * 日持ちなどは目安の初期値で入れ、細かいところは食材マスタの画面で直す。
 */
export function QuickAddIngredient({
  suggestedName,
  suggestedUnit,
  onAdded,
}: {
  suggestedName: string
  suggestedUnit: string | null
  onAdded: (ingredient: Ingredient) => void
}) {
  const save = useSaveIngredient(undefined)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(suggestedName)
  const [category, setCategory] = useState<Category>('vegetable')
  const [unit, setUnit] = useState(suggestedUnit || '個')
  const [gramsPerUnit, setGramsPerUnit] = useState('')
  const [canFreeze, setCanFreeze] = useState(true)
  const [fridgeDays, setFridgeDays] = useState('3')
  const [error, setError] = useState<string | null>(null)

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)} className="w-full">
        「{suggestedName}」を食材マスタに追加
      </Button>
    )
  }

  async function onAdd() {
    const input = {
      name,
      category,
      unit,
      gramsPerUnit: unit.trim() === 'g' ? null : parseNumber(gramsPerUnit),
      canFreeze,
      fridgeDays: parseNumber(fridgeDays) ?? Number.NaN,
      freezerDays: canFreeze ? 30 : null,
      defaultLocation: 'fridge' as const,
    }
    const parsed = ingredientInputSchema.safeParse(input)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '入力内容を確認してください')
      return
    }
    setError(null)
    try {
      onAdded(await save.mutateAsync(input))
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : '追加できませんでした')
    }
  }

  return (
    <div className="space-y-2 rounded-lg bg-orange-50 p-3">
      <p className="text-xs text-stone-600">
        日持ちは目安で入れます。冷凍の日持ちなどはあとで食材マスタの画面で直してください。
      </p>
      <input value={name} onChange={(e) => setName(e.target.value)} aria-label="名前" className={inputClass} />
      <div className="flex gap-2">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as Category)}
          aria-label="売り場"
          className={`${inputBaseClass} min-w-0 flex-1`}
        >
          {CATEGORY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          aria-label="基準単位"
          placeholder="単位"
          className={`${inputBaseClass} w-20 shrink-0`}
        />
      </div>
      <div className="flex gap-2">
        {unit.trim() !== 'g' && (
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={gramsPerUnit}
            onChange={(e) => setGramsPerUnit(e.target.value)}
            aria-label={`1${unit}あたりの重さ（g）`}
            placeholder={`1${unit}の重さ g`}
            className={`${inputBaseClass} min-w-0 flex-1`}
          />
        )}
        <input
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={fridgeDays}
          onChange={(e) => setFridgeDays(e.target.value)}
          aria-label="冷蔵の日持ち（日）"
          placeholder="冷蔵 日"
          className={`${inputBaseClass} w-24 shrink-0`}
        />
      </div>
      <Checkbox label="冷凍できる" checked={canFreeze} onChange={setCanFreeze} />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button onClick={onAdd} disabled={save.isPending} className="flex-1">
          {save.isPending ? '追加中…' : '追加する'}
        </Button>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          やめる
        </Button>
      </div>
    </div>
  )
}
