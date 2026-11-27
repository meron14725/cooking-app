import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { PRICE_STALE_DAYS } from '../../shared/domain/constants'
import { representativeLabel, rescalePrice } from '../../shared/domain/cost'
import { diffDays, todayJst } from '../../shared/domain/date'
import { representativeQuantity } from '../../shared/domain/recommend'
import {
  CATEGORY_OPTIONS,
  type Category,
  type Ingredient,
  type IngredientInput,
  ingredientInputSchema,
  LOCATION_OPTIONS,
  type StorageLocation,
} from '../../shared/schemas/ingredient'
import { ApiRequestError } from '../api/client'
import { useDeleteIngredient, useIngredient, useSaveIngredient } from '../api/ingredients'
import { Button, Checkbox, Field, inputBaseClass, inputClass, parseNumber } from '../components/form'
import { Icon } from '../components/Icon'
import { PageHeader, useGoBack } from '../components/PageHeader'

type UnitForm = { key: string; id?: string; label: string; quantity: string; isDefault: boolean }

type FormState = {
  name: string
  aliases: string
  category: Category
  unit: string
  gramsPerUnit: string
  canFreeze: boolean
  fridgeDays: string
  freezerDays: string
  pantryDays: string
  preppedFridgeDays: string
  preppedFreezerDays: string
  defaultLocation: StorageLocation
  beforeCookTask: string
  frozenCookNote: string
  isStaple: boolean
  priceYen: string
  /** 価格の欄を手で触ったか。触っていなければ価格は送らず、代表を変えたときの換算はサーバーに任せる */
  priceTouched: boolean
  packageUnits: UnitForm[]
}

let unitKey = 0
const newUnitKey = () => `u${++unitKey}`

const emptyForm: FormState = {
  name: '',
  aliases: '',
  category: 'vegetable',
  unit: '個',
  gramsPerUnit: '',
  canFreeze: true,
  fridgeDays: '7',
  freezerDays: '30',
  pantryDays: '',
  preppedFridgeDays: '',
  preppedFreezerDays: '',
  defaultLocation: 'fridge',
  beforeCookTask: '',
  frozenCookNote: '',
  isStaple: false,
  priceYen: '',
  priceTouched: false,
  packageUnits: [],
}

const str = (n: number | null) => (n === null ? '' : String(n))

function toForm(i: Ingredient): FormState {
  return {
    name: i.name,
    aliases: i.aliases.join('、'),
    category: i.category,
    unit: i.unit,
    gramsPerUnit: str(i.gramsPerUnit),
    canFreeze: i.canFreeze,
    fridgeDays: String(i.fridgeDays),
    freezerDays: str(i.freezerDays),
    pantryDays: str(i.pantryDays),
    preppedFridgeDays: str(i.preppedFridgeDays),
    preppedFreezerDays: str(i.preppedFreezerDays),
    defaultLocation: i.defaultLocation,
    beforeCookTask: i.beforeCookTask ?? '',
    frozenCookNote: i.frozenCookNote ?? '',
    isStaple: i.isStaple,
    priceYen: str(i.priceYen),
    priceTouched: false,
    packageUnits: i.packageUnits.map((u) => ({
      key: newUnitKey(),
      id: u.id,
      label: u.label,
      quantity: String(u.quantity),
      isDefault: u.isDefault,
    })),
  }
}

function toInput(f: FormState): IngredientInput {
  return {
    name: f.name,
    aliases: f.aliases
      .split(/[、,，\s]+/)
      .map((a) => a.trim())
      .filter(Boolean),
    category: f.category,
    unit: f.unit,
    // 基準単位が g なら換算は不要（入力欄も隠れるので、残っていた値は送らない）
    gramsPerUnit: f.unit.trim() === 'g' ? null : parseNumber(f.gramsPerUnit),
    canFreeze: f.canFreeze,
    fridgeDays: parseNumber(f.fridgeDays) ?? Number.NaN,
    freezerDays: f.canFreeze ? parseNumber(f.freezerDays) : null,
    pantryDays: parseNumber(f.pantryDays),
    preppedFridgeDays: parseNumber(f.preppedFridgeDays),
    preppedFreezerDays: f.canFreeze ? parseNumber(f.preppedFreezerDays) : null,
    defaultLocation: f.defaultLocation,
    beforeCookTask: f.beforeCookTask,
    frozenCookNote: f.frozenCookNote,
    isStaple: f.isStaple,
    // 触っていなければ省略（サーバーは今の値を残し、代表を変えたら単価を保って換算する）
    priceYen: f.priceTouched ? parseNumber(f.priceYen) : undefined,
    packageUnits: f.packageUnits.map((u) => ({
      id: u.id,
      label: u.label,
      quantity: parseNumber(u.quantity) ?? Number.NaN,
      isDefault: u.isDefault,
    })),
  }
}

/** 入力中の販売単位（名前と量が入っているものだけ） */
function formUnits(f: FormState) {
  return {
    unit: f.unit.trim(),
    packageUnits: f.packageUnits
      .map((u) => ({ label: u.label.trim(), quantity: parseNumber(u.quantity) ?? 0, isDefault: u.isDefault }))
      .filter((u) => u.label && u.quantity > 0),
  }
}

/** 価格の欄のラベル（代表量の名前）。入力中の販売単位から出す */
function priceBasisLabel(f: FormState): string {
  return representativeLabel(formUnits(f))
}

/**
 * 価格の欄に出す値。触っていなければ、保存済みの価格を入力中の代表量に換算して出す
 * （保存するとサーバーが同じ換算をする。docs/design/10-cost.md）
 */
function priceFieldValue(f: FormState, saved: Ingredient | undefined): string {
  if (f.priceTouched || !saved || saved.priceYen === null) return f.priceYen
  return String(rescalePrice(saved.priceYen, representativeQuantity(saved), representativeQuantity(formUnits(f))))
}

/** 「目安（自動）· 2026-11-27」「手入力 · 2026-11-27（1 年以上前の価格）」 */
function priceNote(i: Ingredient | undefined): { text: string; stale: boolean } | null {
  if (!i || i.priceYen === null || !i.priceUpdatedAt) return null
  const date = todayJst(new Date(i.priceUpdatedAt))
  const stale = diffDays(date, todayJst()) > PRICE_STALE_DAYS
  return { text: `${i.priceSource === 'manual' ? '手入力' : '目安（自動）'} · ${date}`, stale }
}

const UNIT_SUGGESTIONS = ['個', '本', '枚', '袋', 'パック', '丁', '株', '切れ', '缶', 'g', 'ml']

export function IngredientEditPage() {
  const { id } = useParams()
  const goBack = useGoBack('/ingredients')
  const existing = useIngredient(id)
  const save = useSaveIngredient(id)
  const remove = useDeleteIngredient()

  const [form, setForm] = useState<FormState>(emptyForm)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    if (existing.data) setForm(toForm(existing.data))
  }, [existing.data])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }))
  const setUnit = (key: string, patch: Partial<UnitForm>) =>
    setForm((f) => ({
      ...f,
      packageUnits: f.packageUnits.map((u) =>
        u.key === key
          ? { ...u, ...patch }
          : patch.isDefault
            ? { ...u, isDefault: false } // 代表は 1 つだけ
            : u,
      ),
    }))

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const input = toInput(form)
    const parsed = ingredientInputSchema.safeParse(input)
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form')
        next[key] ??= issue.message
      }
      setErrors(next)
      return
    }
    setErrors({})
    try {
      await save.mutateAsync(input)
      goBack()
    } catch (err) {
      setErrors({ form: err instanceof ApiRequestError ? err.message : '保存できませんでした' })
    }
  }

  async function onDelete() {
    if (!id) return
    setDeleteError(null)
    try {
      await remove.mutateAsync(id)
      goBack()
    } catch (err) {
      setDeleteError(err instanceof ApiRequestError ? err.message : '削除できませんでした')
    }
  }

  if (id && existing.isPending) return <p className="text-ink-muted">読み込み中…</p>
  if (id && existing.isError) return <p className="text-danger">食材が見つかりませんでした</p>

  const numberField = (key: keyof FormState, label: string, opts: { hint?: string; disabled?: boolean } = {}) => (
    <Field label={label} hint={opts.hint} error={errors[key]}>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        value={form[key] as string}
        disabled={opts.disabled}
        onChange={(e) => set(key, e.target.value as never)}
        className={inputClass}
      />
    </Field>
  )

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <PageHeader title={id ? '食材を編集' : '食材を追加'} backTo="/ingredients" />

      <Field label="名前" error={errors.name}>
        <input value={form.name} onChange={(e) => set('name', e.target.value)} className={inputClass} required />
      </Field>
      <Field label="別名" hint="URL取り込みの照合に使います。「、」区切り" error={errors.aliases}>
        <input value={form.aliases} onChange={(e) => set('aliases', e.target.value)} className={inputClass} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="売り場" error={errors.category}>
          <select
            value={form.category}
            onChange={(e) => set('category', e.target.value as Category)}
            className={inputClass}
          >
            {CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="基準単位" hint="量はすべてこの単位" error={errors.unit}>
          <input
            value={form.unit}
            onChange={(e) => set('unit', e.target.value)}
            list="unit-suggestions"
            className={inputClass}
          />
          <datalist id="unit-suggestions">
            {UNIT_SUGGESTIONS.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </Field>
      </div>
      {form.unit.trim() !== 'g' &&
        numberField('gramsPerUnit', `1${form.unit}あたりの重さ（g）`, {
          hint: 'レシピの「100g」をこの単位に直すときに使います',
        })}

      <fieldset className="space-y-3 rounded-card bg-surface shadow-card p-4">
        <legend className="px-1 text-sm font-bold text-ink-soft">保存と日持ち（目安）</legend>
        <Field label="買ったときの保存場所" error={errors.defaultLocation}>
          <select
            value={form.defaultLocation}
            onChange={(e) => set('defaultLocation', e.target.value as StorageLocation)}
            className={inputClass}
          >
            {LOCATION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value} disabled={o.value === 'freezer' && !form.canFreeze}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Checkbox label="冷凍できる" checked={form.canFreeze} onChange={(v) => set('canFreeze', v)} />
        <div className="grid grid-cols-3 gap-3">
          {numberField('fridgeDays', '冷蔵（日）')}
          {numberField('freezerDays', '冷凍（日）', { disabled: !form.canFreeze })}
          {numberField('pantryDays', '常温（日）', { hint: '空 = 常温不可' })}
        </div>
        <p className="text-xs text-ink-muted">切った後の日持ち（空なら冷蔵 2日・冷凍 21日）</p>
        <div className="grid grid-cols-2 gap-3">
          {numberField('preppedFridgeDays', '切った後・冷蔵（日）')}
          {numberField('preppedFreezerDays', '切った後・冷凍（日）', { disabled: !form.canFreeze })}
        </div>
      </fieldset>

      <fieldset className="space-y-3 rounded-card bg-surface shadow-card p-4">
        <legend className="px-1 text-sm font-bold text-ink-soft">調理のときの注意</legend>
        <Field
          label="入れる直前の作業"
          hint="例: 入れる直前に切る、水で戻す。空なら直前作業なし"
          error={errors.beforeCookTask}
        >
          <input
            value={form.beforeCookTask}
            onChange={(e) => set('beforeCookTask', e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="冷凍のまま入れるときの注意" error={errors.frozenCookNote}>
          <input
            value={form.frozenCookNote}
            onChange={(e) => set('frozenCookNote', e.target.value)}
            className={inputClass}
          />
        </Field>
        <Checkbox
          label="常備品（調味料など。使い切りの計算に入れない）"
          checked={form.isStaple}
          onChange={(v) => set('isStaple', v)}
        />
      </fieldset>

      <fieldset className="space-y-3 rounded-card bg-surface shadow-card p-4">
        <legend className="px-1 text-sm font-bold text-ink-soft">販売単位</legend>
        {errors.packageUnits && <p className="text-xs text-danger">{errors.packageUnits}</p>}
        {form.packageUnits.length === 0 && <p className="text-sm text-ink-muted">なし（量り売り扱い）</p>}
        {form.packageUnits.map((u) => (
          <div key={u.key} className="flex items-end gap-2">
            <Field label="名前">
              <input
                value={u.label}
                placeholder="3個入り"
                onChange={(e) => setUnit(u.key, { label: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label={`量（${form.unit}）`}>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={u.quantity}
                onChange={(e) => setUnit(u.key, { quantity: e.target.value })}
                className={`${inputBaseClass} w-20`}
              />
            </Field>
            <label className="flex min-h-11 shrink-0 items-center gap-1 text-xs">
              <input
                type="radio"
                name="default-unit"
                checked={u.isDefault}
                onChange={() => setUnit(u.key, { isDefault: true })}
                className="size-4 accent-accent"
              />
              代表
            </label>
            <button
              type="button"
              aria-label={`${u.label || '販売単位'}を削除`}
              onClick={() =>
                set(
                  'packageUnits',
                  form.packageUnits.filter((x) => x.key !== u.key),
                )
              }
              className="min-h-11 shrink-0 px-2 text-ink-muted"
            >
              <Icon name="close" size={18} />
            </button>
          </div>
        ))}
        <Button
          variant="add"
          onClick={() =>
            set('packageUnits', [
              ...form.packageUnits,
              { key: newUnitKey(), label: '', quantity: '', isDefault: form.packageUnits.length === 0 },
            ])
          }
        >
          <Icon name="plus" size={18} strokeWidth={2} />
          販売単位を追加
        </Button>
      </fieldset>

      <fieldset className="space-y-2 rounded-card bg-surface shadow-card p-4">
        <legend className="px-1 text-sm font-bold text-ink-soft">価格（目安）</legend>
        <Field
          label={`${priceBasisLabel(form)} あたり（円）`}
          hint={
            form.isStaple
              ? '常備品は買い物の合計に入れません'
              : '空 = 未設定。代表の販売単位を変えると、同じ単価になるよう金額も変わります'
          }
          error={errors.priceYen}
        >
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={priceFieldValue(form, existing.data)}
            onChange={(e) => setForm((f) => ({ ...f, priceYen: e.target.value, priceTouched: true }))}
            className={inputClass}
          />
        </Field>
        {(() => {
          const note = priceNote(existing.data)
          if (!note) return null
          return (
            <p className={`text-xs ${note.stale ? 'text-warn' : 'text-ink-muted'}`}>
              {note.text}
              {note.stale && '（1 年以上前の価格）'}
            </p>
          )
        })()}
      </fieldset>

      {errors.form && <p className="text-sm text-danger">{errors.form}</p>}
      {Object.keys(errors).length > 0 && !errors.form && (
        <p className="text-sm text-danger">入力内容を確認してください</p>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={save.isPending} className="flex-1">
          {save.isPending ? '保存中…' : '保存'}
        </Button>
        <Button variant="secondary" onClick={() => goBack()}>
          戻る
        </Button>
      </div>

      {id && (
        <div className="border-t border-line pt-5">
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
              この食材を削除
            </Button>
          )}
          {deleteError && <p className="mt-2 text-sm text-danger">{deleteError}</p>}
        </div>
      )}
    </form>
  )
}
