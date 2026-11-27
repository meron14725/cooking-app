import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { normalizeUnit, toBaseQuantity, toGrams, type UnitMaster } from '../../shared/domain/units'
import { CATEGORY_OPTIONS, type Ingredient } from '../../shared/schemas/ingredient'
import {
  type Recipe,
  type RecipeInput,
  recipeInputSchema,
  SOURCE_TYPE_LABELS,
  STEP_PHASE_LABELS,
  STEP_PHASES,
  type StepPhase,
} from '../../shared/schemas/recipe'
import { ApiRequestError } from '../api/client'
import { useIngredients } from '../api/ingredients'
import { useDeleteRecipe, useRecipe, useSaveRecipe } from '../api/recipes'
import { Button, Checkbox, Field, inputBaseClass, inputClass, parseNumber } from '../components/form'
import { PageHeader } from '../components/PageHeader'

type IngredientRow = {
  key: string
  ingredientId: string
  quantity: string
  /** 入力した量の単位。保存時に基準単位へ直す */
  unit: string
  displayText: string
  cutStyle: string
  addOrder: string
}

type StepRow = { key: string; phase: StepPhase; text: string }

type FormState = {
  title: string
  servings: string
  caloriesKcal: string
  caloriesEstimated: boolean
  hotcookMode: string
  maxServings1_6l: string
  packSeasonings: boolean
  sourceUrl: string
  notes: string
  ingredients: IngredientRow[]
  steps: StepRow[]
}

let rowKey = 0
const newKey = () => `r${++rowKey}`

const newIngredientRow = (): IngredientRow => ({
  key: newKey(),
  ingredientId: '',
  quantity: '',
  unit: '',
  displayText: '',
  cutStyle: '',
  addOrder: '',
})

const emptyForm = (): FormState => ({
  title: '',
  servings: '2',
  caloriesKcal: '',
  caloriesEstimated: false,
  hotcookMode: '',
  maxServings1_6l: '',
  packSeasonings: false,
  sourceUrl: '',
  notes: '',
  ingredients: [newIngredientRow()],
  steps: [],
})

const str = (n: number | null) => (n === null ? '' : String(n))

function toForm(r: Recipe): FormState {
  return {
    title: r.title,
    servings: String(r.servings),
    caloriesKcal: str(r.caloriesKcal),
    caloriesEstimated: r.caloriesEstimated,
    hotcookMode: r.hotcookMode ?? '',
    maxServings1_6l: str(r.maxServings1_6l),
    packSeasonings: r.packSeasonings,
    sourceUrl: r.sourceUrl ?? '',
    notes: r.notes ?? '',
    ingredients: r.ingredients.map((i) => ({
      key: newKey(),
      ingredientId: i.ingredientId,
      quantity: str(i.quantity),
      unit: i.unit,
      displayText: i.displayText,
      cutStyle: i.cutStyle ?? '',
      addOrder: i.addOrder ? String(i.addOrder) : '',
    })),
    steps: r.steps.map((s) => ({ key: newKey(), phase: s.phase, text: s.text })),
  }
}

/** 入力できる単位: 基準単位、g（重さが分かる食材）、大さじ・小さじ（ml の食材） */
function unitChoices(m: UnitMaster | undefined): string[] {
  if (!m) return []
  const base = normalizeUnit(m.unit)
  const choices = [m.unit]
  if (base !== 'g' && m.gramsPerUnit) choices.push('g')
  if (base === 'ml') choices.push('大さじ', '小さじ')
  return choices
}

/** 表示文字列を空にしたときに使う文字列（例: 玉ねぎ 150g） */
function autoDisplayText(row: IngredientRow, master: UnitMaster | undefined): string {
  if (!master) return ''
  const amount = parseNumber(row.quantity)
  return `${master.name} ${amount === null ? '適量' : `${amount}${row.unit || master.unit}`}`
}

type Converted = { input: RecipeInput; unitErrors: Record<string, string> }

function toInput(f: FormState, masters: Map<string, UnitMaster>): Converted {
  const unitErrors: Record<string, string> = {}
  const ingredients = f.ingredients.map((row, index) => {
    const master = masters.get(row.ingredientId)
    const amount = parseNumber(row.quantity)
    let quantity: number | null = amount
    if (master && amount !== null && row.unit && row.unit !== master.unit) {
      const converted = toBaseQuantity({ quantity: amount, unit: row.unit }, master)
      if (converted.warning) unitErrors[`ingredients.${index}.quantity`] = converted.warning
      quantity = converted.quantity
    }
    const fallbackText = autoDisplayText(row, master)
    return {
      ingredientId: row.ingredientId,
      quantity,
      displayText: row.displayText.trim() || fallbackText,
      cutStyle: row.cutStyle,
      addOrder: parseNumber(row.addOrder) ?? 0,
    }
  })
  return {
    unitErrors,
    input: {
      title: f.title,
      servings: parseNumber(f.servings) ?? Number.NaN,
      caloriesKcal: parseNumber(f.caloriesKcal),
      caloriesEstimated: f.caloriesEstimated,
      hotcookMode: f.hotcookMode,
      maxServings1_6l: parseNumber(f.maxServings1_6l),
      packSeasonings: f.packSeasonings,
      sourceUrl: f.sourceUrl.trim() || null,
      notes: f.notes,
      ingredients,
      steps: f.steps.map((s) => ({ phase: s.phase, text: s.text })),
    },
  }
}

function move<T>(list: T[], index: number, delta: number): T[] {
  const to = index + delta
  if (to < 0 || to >= list.length) return list
  const next = [...list]
  const [item] = next.splice(index, 1)
  if (item !== undefined) next.splice(to, 0, item)
  return next
}

export function RecipeEditPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const existing = useRecipe(id)
  const masterList = useIngredients()
  const save = useSaveRecipe(id)
  const remove = useDeleteRecipe()

  const [form, setForm] = useState<FormState>(emptyForm)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    if (existing.data) setForm(toForm(existing.data))
  }, [existing.data])

  /** 選べる食材（マスタ）と、このレシピで使っている削除済みの食材 */
  const masters = useMemo(() => {
    const map = new Map<string, UnitMaster & { category?: Ingredient['category']; archived?: boolean }>()
    for (const i of masterList.data ?? []) map.set(i.id, i)
    for (const i of existing.data?.ingredients ?? []) {
      if (!map.has(i.ingredientId)) {
        map.set(i.ingredientId, { name: i.ingredientName, unit: i.unit, gramsPerUnit: null, archived: true })
      }
    }
    return map
  }, [masterList.data, existing.data])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }))
  const setRow = (key: string, patch: Partial<IngredientRow>) =>
    setForm((f) => ({ ...f, ingredients: f.ingredients.map((r) => (r.key === key ? { ...r, ...patch } : r)) }))
  const setStep = (key: string, patch: Partial<StepRow>) =>
    setForm((f) => ({ ...f, steps: f.steps.map((s) => (s.key === key ? { ...s, ...patch } : s)) }))

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const { input, unitErrors } = toInput(form, masters)
    const parsed = recipeInputSchema.safeParse(input)
    const next: Record<string, string> = { ...unitErrors }
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path.length > 0 ? issue.path.join('.') : 'form'
        next[key] ??= issue.message
        // 配列そのものへのエラー（材料 0 件など）
        if (issue.path.length === 1) next[String(issue.path[0])] ??= issue.message
      }
    }
    if (Object.keys(next).length > 0) {
      setErrors(next)
      return
    }
    setErrors({})
    try {
      await save.mutateAsync(input)
      navigate('/recipes')
    } catch (err) {
      setErrors({ form: err instanceof ApiRequestError ? err.message : '保存できませんでした' })
    }
  }

  async function onDelete() {
    if (!id) return
    setDeleteError(null)
    try {
      await remove.mutateAsync(id)
      navigate('/recipes')
    } catch (err) {
      setDeleteError(err instanceof ApiRequestError ? err.message : '削除できませんでした')
    }
  }

  if (id && existing.isPending) return <p className="text-stone-500">読み込み中…</p>
  if (id && existing.isError) return <p className="text-red-600">レシピが見つかりませんでした</p>

  const activeMasters = masterList.data ?? []

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <PageHeader title={id ? 'レシピを編集' : 'レシピを追加'} />
      {existing.data && (
        <p className="-mt-3 text-xs text-stone-500">作成元: {SOURCE_TYPE_LABELS[existing.data.sourceType]}</p>
      )}

      <Field label="料理名" error={errors.title}>
        <input value={form.title} onChange={(e) => set('title', e.target.value)} className={inputClass} required />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="何人前の分量か" error={errors.servings}>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={form.servings}
            onChange={(e) => set('servings', e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="1.6Lで作れる人数" hint="空なら不明" error={errors.maxServings1_6l}>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={form.maxServings1_6l}
            onChange={(e) => set('maxServings1_6l', e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <Field
        label="1人前のカロリー（kcal）"
        hint={form.caloriesEstimated ? '目安（推定値）。数値を直すと推定の印は外れます' : undefined}
        error={errors.caloriesKcal}
      >
        <input
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={form.caloriesKcal}
          onChange={(e) => setForm((f) => ({ ...f, caloriesKcal: e.target.value, caloriesEstimated: false }))}
          className={inputClass}
        />
      </Field>

      <Field label="ホットクックの設定" hint="例: 手動 > 煮物を作る > まぜる > 20分" error={errors.hotcookMode}>
        <input value={form.hotcookMode} onChange={(e) => set('hotcookMode', e.target.value)} className={inputClass} />
      </Field>

      <Checkbox
        label="調味料も袋に入れる（下味冷凍）"
        checked={form.packSeasonings}
        onChange={(v) => set('packSeasonings', v)}
      />

      <fieldset className="min-w-0 space-y-3 rounded-xl border border-stone-200 bg-white p-4">
        <legend className="px-1 text-sm font-bold text-stone-700">材料（{form.servings || '?'}人前）</legend>
        <p className="text-xs text-stone-500">
          量は空にすると「少々・適量」の扱いです。マスタにない食材は先に
          <Link to="/ingredients/new" className="mx-1 text-orange-700 underline">
            食材マスタ
          </Link>
          に追加してください。
        </p>
        {errors.ingredients && <p className="text-xs text-red-600">{errors.ingredients}</p>}
        {form.ingredients.map((row, index) => {
          const master = masters.get(row.ingredientId)
          const choices = unitChoices(master)
          const unit = row.unit || master?.unit || ''
          const amount = parseNumber(row.quantity)
          const grams =
            master && amount !== null && unit === master.unit && normalizeUnit(master.unit) !== 'g'
              ? toGrams(amount, master)
              : null
          const err = (field: string) => errors[`ingredients.${index}.${field}`]
          return (
            <div key={row.key} className="space-y-2 rounded-lg border border-stone-200 p-3">
              <div className="flex gap-2">
                <select
                  value={row.ingredientId}
                  onChange={(e) => {
                    const m = masters.get(e.target.value)
                    setRow(row.key, { ingredientId: e.target.value, unit: m?.unit ?? '', displayText: '' })
                  }}
                  aria-label="食材"
                  className={`${inputBaseClass} min-w-0 flex-1`}
                >
                  <option value="">食材を選ぶ</option>
                  {master?.archived && <option value={row.ingredientId}>{master.name}（削除済み）</option>}
                  {CATEGORY_OPTIONS.map((cat) => {
                    const items = activeMasters.filter((i) => i.category === cat.value)
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
                <Button
                  variant="secondary"
                  aria-label="上へ"
                  onClick={() => set('ingredients', move(form.ingredients, index, -1))}
                  disabled={index === 0}
                >
                  ↑
                </Button>
                <Button
                  variant="danger"
                  aria-label="この材料を消す"
                  onClick={() =>
                    set(
                      'ingredients',
                      form.ingredients.filter((r) => r.key !== row.key),
                    )
                  }
                >
                  ×
                </Button>
              </div>
              {err('ingredientId') && <p className="text-xs text-red-600">{err('ingredientId')}</p>}

              <div className="flex gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={row.quantity}
                  onChange={(e) => setRow(row.key, { quantity: e.target.value, displayText: '' })}
                  placeholder="量"
                  aria-label="量"
                  className={`${inputBaseClass} min-w-0 flex-1`}
                />
                <select
                  value={unit}
                  onChange={(e) => setRow(row.key, { unit: e.target.value, displayText: '' })}
                  aria-label="単位"
                  disabled={choices.length <= 1}
                  className={`${inputBaseClass} w-24 shrink-0`}
                >
                  {choices.length === 0 && <option value="">単位</option>}
                  {choices.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              {err('quantity') && <p className="text-xs text-red-600">{err('quantity')}</p>}
              {master && unit !== master.unit && (
                <p className="text-xs text-stone-500">保存するときに{master.unit}に直します</p>
              )}
              {grams !== null && <p className="text-xs text-stone-500">約 {grams}g</p>}

              <input
                value={row.displayText}
                onChange={(e) => setRow(row.key, { displayText: e.target.value })}
                placeholder={master ? `表示（空なら「${autoDisplayText(row, master)}」）` : '表示（例: 玉ねぎ 1/2個）'}
                aria-label="表示"
                className={inputClass}
              />
              <div className="flex gap-2">
                <input
                  value={row.cutStyle}
                  onChange={(e) => setRow(row.key, { cutStyle: e.target.value })}
                  placeholder="切り方（空なら切らない）"
                  aria-label="切り方"
                  className={`${inputBaseClass} min-w-0 flex-1`}
                />
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={row.addOrder}
                  onChange={(e) => setRow(row.key, { addOrder: e.target.value })}
                  placeholder="入れる順"
                  aria-label="ホットクックに入れる順"
                  className={`${inputBaseClass} w-24 shrink-0`}
                />
              </div>
            </div>
          )
        })}
        <Button variant="secondary" onClick={() => set('ingredients', [...form.ingredients, newIngredientRow()])}>
          ＋ 材料を追加
        </Button>
      </fieldset>

      <fieldset className="min-w-0 space-y-3 rounded-xl border border-stone-200 bg-white p-4">
        <legend className="px-1 text-sm font-bold text-stone-700">手順</legend>
        <p className="text-xs text-stone-500">下ごしらえ（切る・下味）と調理（ホットクックに入れてから）に分けます。</p>
        {form.steps.map((step, index) => {
          const err = errors[`steps.${index}.text`]
          return (
            <div key={step.key} className="space-y-2 rounded-lg border border-stone-200 p-3">
              <div className="flex gap-2">
                <span className="self-center text-sm font-bold text-stone-500">{index + 1}</span>
                <select
                  value={step.phase}
                  onChange={(e) => setStep(step.key, { phase: e.target.value as StepPhase })}
                  aria-label="区分"
                  className={`${inputBaseClass} min-w-0 flex-1`}
                >
                  {STEP_PHASES.map((p) => (
                    <option key={p} value={p}>
                      {STEP_PHASE_LABELS[p]}
                    </option>
                  ))}
                </select>
                <Button
                  variant="secondary"
                  aria-label="上へ"
                  onClick={() => set('steps', move(form.steps, index, -1))}
                  disabled={index === 0}
                >
                  ↑
                </Button>
                <Button
                  variant="danger"
                  aria-label="この手順を消す"
                  onClick={() =>
                    set(
                      'steps',
                      form.steps.filter((s) => s.key !== step.key),
                    )
                  }
                >
                  ×
                </Button>
              </div>
              <textarea
                value={step.text}
                onChange={(e) => setStep(step.key, { text: e.target.value })}
                rows={2}
                aria-label={`手順 ${index + 1}`}
                className={inputClass}
              />
              {err && <p className="text-xs text-red-600">{err}</p>}
            </div>
          )
        })}
        <Button
          variant="secondary"
          onClick={() =>
            set('steps', [
              ...form.steps,
              { key: newKey(), phase: form.steps.at(-1)?.phase ?? 'prep', text: '' } satisfies StepRow,
            ])
          }
        >
          ＋ 手順を追加
        </Button>
      </fieldset>

      <Field label="元のレシピの URL" error={errors.sourceUrl}>
        <input
          type="url"
          inputMode="url"
          value={form.sourceUrl}
          onChange={(e) => set('sourceUrl', e.target.value)}
          className={inputClass}
        />
      </Field>

      <Field label="メモ" error={errors.notes}>
        <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} className={inputClass} />
      </Field>

      {errors.form && <p className="text-sm text-red-600">{errors.form}</p>}
      {Object.keys(errors).length > 0 && !errors.form && (
        <p className="text-sm text-red-600">入力内容を確認してください</p>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={save.isPending} className="flex-1">
          {save.isPending ? '保存中…' : '保存'}
        </Button>
        <Button variant="secondary" onClick={() => navigate('/recipes')}>
          戻る
        </Button>
      </div>

      {id && (
        <div className="border-t border-stone-200 pt-5">
          {confirmDelete ? (
            <div className="flex items-center gap-3">
              <span className="flex-1 text-sm">一覧から消します。よいですか？</span>
              <Button variant="danger" onClick={onDelete} disabled={remove.isPending}>
                削除する
              </Button>
              <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
                やめる
              </Button>
            </div>
          ) : (
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              このレシピを削除
            </Button>
          )}
          {deleteError && <p className="mt-2 text-sm text-red-600">{deleteError}</p>}
        </div>
      )}
    </form>
  )
}
