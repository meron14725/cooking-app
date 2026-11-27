import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { normalizeUnit, toBaseQuantity, toGrams, type UnitMaster } from '../../shared/domain/units'
import type { Ingredient } from '../../shared/schemas/ingredient'
import {
  type Recipe,
  type RecipeInput,
  recipeInputSchema,
  SOURCE_TYPE_LABELS,
  STEP_PHASE_LABELS,
  STEP_PHASES,
  type StepPhase,
} from '../../shared/schemas/recipe'
import type { RecipeDraft, RecipeDraftOfficial } from '../../shared/schemas/recipeDraft'
import { ApiRequestError } from '../api/client'
import { useIngredients } from '../api/ingredients'
import { aiErrorMessage, useDeleteRecipe, useEstimateCalories, useRecipe, useSaveRecipe } from '../api/recipes'
import { Button, Checkbox, Field, inputBaseClass, inputClass, parseNumber } from '../components/form'
import { Icon } from '../components/Icon'
import { IngredientSelect, unitChoices } from '../components/ingredientInputs'
import { PageHeader, useGoBack } from '../components/PageHeader'
import { QuickAddIngredient } from '../components/QuickAddIngredient'
import { RecipePhoto } from '../components/RecipePhoto'
import type { EditFromDetail } from './RecipeDetailPage'

type IngredientRow = {
  key: string
  ingredientId: string
  quantity: string
  /** 入力した量の単位。保存時に基準単位へ直す */
  unit: string
  displayText: string
  cutStyle: string
  addOrder: string
  /** URL 取り込みでマスタと照合できなかった食材の候補名と単位 */
  suggestedName?: string
  suggestedUnit?: string | null
  /** 行への注意（マスタに追加して単位が変わったときなど） */
  notice?: string
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
  /** 作成時だけ使う（更新では変わらない） */
  sourceType: 'manual' | 'url' | 'ai'
  /** 公式レシピから取り込んだ下書きの情報（作成時だけ送る。編集では送らず、サーバの値を残す） */
  official: RecipeDraftOfficial | null
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
  sourceType: 'manual',
  official: null,
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
    sourceType: 'manual',
    official: null,
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

/** URL 取り込み・AI 補完提案の下書きからフォームを作る。マスタにない食材は候補名を残して、その場で追加できるようにする */
function fromDraft(d: RecipeDraft, masters: Map<string, UnitMaster>): FormState {
  return {
    ...emptyForm(),
    title: d.title,
    servings: String(d.servings),
    caloriesKcal: str(d.caloriesKcal),
    hotcookMode: d.hotcookMode ?? '',
    maxServings1_6l: str(d.maxServings1_6l),
    sourceUrl: d.sourceUrl ?? '',
    sourceType: d.sourceType,
    official: d.official,
    ingredients: d.ingredients.map((i) => ({
      key: newKey(),
      ingredientId: i.ingredientId ?? '',
      quantity: str(i.quantity),
      unit: i.ingredientId ? (masters.get(i.ingredientId)?.unit ?? '') : '',
      displayText: i.displayText,
      cutStyle: i.cutStyle ?? '',
      addOrder: '',
      suggestedName: i.ingredientId ? undefined : i.suggestedName,
      suggestedUnit: i.ingredientId ? undefined : i.suggestedUnit,
    })),
    steps: d.steps.map((s) => ({ key: newKey(), phase: s.phase, text: s.text })),
  }
}

/**
 * その場でマスタに追加した食材を行に入れる。量は候補の単位のままなので、追加した基準単位と違えば直す。
 * 直せなければ量を空にして確認を促す（2切れ → 2g のような取り違えを防ぐ）
 */
function adoptAddedIngredient(row: IngredientRow, added: UnitMaster & { id: string }): Partial<IngredientRow> {
  const amount = parseNumber(row.quantity)
  const from = row.suggestedUnit
  if (amount === null || !from || normalizeUnit(from) === normalizeUnit(added.unit)) {
    return { ingredientId: added.id, unit: added.unit, notice: undefined }
  }
  const converted = toBaseQuantity({ quantity: amount, unit: from }, added)
  if (converted.quantity !== null) {
    return {
      ingredientId: added.id,
      unit: added.unit,
      quantity: String(converted.quantity),
      notice: `${amount}${from} を ${converted.quantity}${added.unit} に直しました`,
    }
  }
  return {
    ingredientId: added.id,
    unit: added.unit,
    quantity: '',
    notice: `元の量は ${amount}${from} です。${added.unit}での量を入れてください`,
  }
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
      sourceType: f.sourceType,
      ...f.official,
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

/** 公式レシピの写真と件数。写真のキーも件数もないレシピでは出さない */
function OfficialInfo({ info }: { info: RecipeDraftOfficial | null }) {
  if (!info) return null
  const facts = [
    info.officialMenuNo && `メニュー No.${info.officialMenuNo}`,
    info.favoriteCount !== null && `お気に入り ${info.favoriteCount.toLocaleString('ja-JP')}`,
    info.cookCount !== null && `作られた回数 ${info.cookCount.toLocaleString('ja-JP')}`,
  ].filter(Boolean)
  if (!info.imageKey && facts.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      {info.imageKey && <RecipePhoto imageKey={info.imageKey} className="aspect-[4/3] w-full rounded-card" />}
      {facts.length > 0 && <p className="text-[13px] text-ink-muted">{facts.join(' ・ ')}</p>}
    </div>
  )
}

export function RecipeEditPage() {
  const { id } = useParams()
  const location = useLocation()
  /** URL 取り込み（S11）や AI 補完提案（S03）から来たときの下書き。returnTo は保存・やめたときの戻り先 */
  const state = id ? null : (location.state as { draft?: RecipeDraft; returnTo?: string } | null)
  const draft = state?.draft
  const back = state?.returnTo ?? (id ? `/recipes/${id}` : '/recipes')
  const goBack = useGoBack(back)
  const navigate = useNavigate()
  const existing = useRecipe(id)
  const estimate = useEstimateCalories()
  const [estimateError, setEstimateError] = useState<string | null>(null)
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

  // 下書きは食材マスタを読んでから 1 回だけフォームに入れる（基準単位を決めるため）
  const [draftLoaded, setDraftLoaded] = useState(false)
  useEffect(() => {
    if (!draft || draftLoaded || !masterList.data) return
    setForm(fromDraft(draft, new Map(masterList.data.map((m) => [m.id, m]))))
    setDraftLoaded(true)
  }, [draft, draftLoaded, masterList.data])

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
      goBack()
    } catch (err) {
      setErrors({ form: err instanceof ApiRequestError ? err.message : '保存できませんでした' })
    }
  }

  async function onEstimate() {
    setEstimateError(null)
    const { input } = toInput(form, masters)
    const servings = parseNumber(form.servings)
    const ingredients = input.ingredients.filter((i) => i.displayText).map((i) => ({ displayText: i.displayText }))
    if (!servings || ingredients.length === 0) {
      setEstimateError('人数と材料を入れてから推定してください')
      return
    }
    try {
      const { caloriesKcal } = await estimate.mutateAsync({ servings, ingredients })
      setForm((f) => ({ ...f, caloriesKcal: String(caloriesKcal), caloriesEstimated: true }))
    } catch (err) {
      setEstimateError(aiErrorMessage(err))
    }
  }

  async function onDelete() {
    if (!id) return
    setDeleteError(null)
    try {
      await remove.mutateAsync(id)
      // 消したレシピを見るページには戻れないので一覧へ
      // 消したレシピの見るページに「戻る」で戻らないよう、見るページの手前まで履歴を戻す。
      // 見るページを直接開いていたときは戻る先がないので、一覧に置き換える
      const from = location.state as EditFromDetail | null
      if (from?.fromDetail && from.detailInApp) navigate(-2)
      else navigate('/recipes', { replace: true })
    } catch (err) {
      setDeleteError(err instanceof ApiRequestError ? err.message : '削除できませんでした')
    }
  }

  if (id && existing.isPending) return <p className="text-ink-muted">読み込み中…</p>
  if (id && existing.isError) return <p className="text-danger">レシピが見つかりませんでした</p>

  const activeMasters = masterList.data ?? []

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <PageHeader title={id ? 'レシピを編集' : 'レシピを追加'} backTo={back} />
      {existing.data && (
        <p className="-mt-3 text-xs text-ink-muted">作成元: {SOURCE_TYPE_LABELS[existing.data.sourceType]}</p>
      )}
      <OfficialInfo info={existing.data ?? draft?.official ?? null} />
      {draft && (
        <div className="-mt-1 space-y-1 rounded-card border border-warn/30 bg-warn-wash p-3 text-sm">
          <p className="font-bold text-warn">AI が作った下書きです。確認してから保存してください</p>
          {draft.warnings.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-warn">
              {draft.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </div>
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
        hint={form.caloriesEstimated ? '目安（AI推定）。数値を直すと推定の印は外れます' : undefined}
        error={errors.caloriesKcal ?? estimateError ?? undefined}
      >
        <div className="flex gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={form.caloriesKcal}
            onChange={(e) => setForm((f) => ({ ...f, caloriesKcal: e.target.value, caloriesEstimated: false }))}
            className={`${inputBaseClass} min-w-0 flex-1`}
          />
          <Button variant="secondary" onClick={onEstimate} disabled={estimate.isPending} className="shrink-0">
            {estimate.isPending ? '推定中…' : 'AIで推定'}
          </Button>
        </div>
      </Field>

      <Field label="ホットクックの設定" hint="例: 手動 > 煮物を作る > まぜる > 20分" error={errors.hotcookMode}>
        <input value={form.hotcookMode} onChange={(e) => set('hotcookMode', e.target.value)} className={inputClass} />
      </Field>

      <Checkbox
        label="調味料も袋に入れる（下味冷凍）"
        checked={form.packSeasonings}
        onChange={(v) => set('packSeasonings', v)}
      />

      <fieldset className="min-w-0 space-y-3 rounded-card bg-surface shadow-card p-4">
        <legend className="px-1 text-sm font-bold text-ink-soft">材料（{form.servings || '?'}人前）</legend>
        <p className="text-xs text-ink-muted">
          量は空にすると「少々・適量」の扱いです。量を変えると表示の文字列は作り直されます。マスタにない食材は先に
          <Link to="/ingredients/new" className="mx-1 text-accent underline">
            食材マスタ
          </Link>
          に追加してください。
        </p>
        {errors.ingredients && <p className="text-xs text-danger">{errors.ingredients}</p>}
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
            <div key={row.key} className="space-y-2 rounded-item border border-line p-3">
              <div className="flex gap-2">
                <IngredientSelect
                  value={row.ingredientId}
                  onChange={(value) => {
                    const m = masters.get(value)
                    setRow(row.key, { ingredientId: value, unit: m?.unit ?? '', displayText: '' })
                  }}
                  ingredients={activeMasters}
                  archivedName={master?.archived ? master.name : undefined}
                  className="flex-1"
                />
                <Button
                  variant="secondary"
                  aria-label="上へ"
                  onClick={() => set('ingredients', move(form.ingredients, index, -1))}
                  disabled={index === 0}
                >
                  <Icon name="arrowUp" size={18} />
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
                  <Icon name="close" size={18} />
                </Button>
              </div>
              {!row.ingredientId && row.suggestedName && (
                <div className="space-y-2">
                  <p className="text-xs text-warn">
                    「{row.suggestedName}」は食材マスタにありません。上で選ぶか、マスタに追加してください。
                  </p>
                  <QuickAddIngredient
                    suggestedName={row.suggestedName}
                    suggestedUnit={row.suggestedUnit ?? null}
                    onAdded={(added) =>
                      setRow(row.key, {
                        ...adoptAddedIngredient(row, added),
                        suggestedName: undefined,
                        suggestedUnit: undefined,
                      })
                    }
                  />
                </div>
              )}
              {err('ingredientId') && <p className="text-xs text-danger">{err('ingredientId')}</p>}

              <div className="flex gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={row.quantity}
                  onChange={(e) => setRow(row.key, { quantity: e.target.value, displayText: '', notice: undefined })}
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
              {err('quantity') && <p className="text-xs text-danger">{err('quantity')}</p>}
              {row.notice && <p className="text-xs text-warn">{row.notice}</p>}
              {master && unit !== master.unit && (
                <p className="text-xs text-ink-muted">保存するときに{master.unit}に直します</p>
              )}
              {grams !== null && <p className="text-xs text-ink-muted">約 {grams}g</p>}

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
        <Button variant="add" onClick={() => set('ingredients', [...form.ingredients, newIngredientRow()])}>
          <Icon name="plus" size={18} strokeWidth={2} />
          材料を追加
        </Button>
      </fieldset>

      <fieldset className="min-w-0 space-y-3 rounded-card bg-surface shadow-card p-4">
        <legend className="px-1 text-sm font-bold text-ink-soft">手順</legend>
        <p className="text-xs text-ink-muted">下ごしらえ（切る・下味）と調理（ホットクックに入れてから）に分けます。</p>
        {form.steps.map((step, index) => {
          const err = errors[`steps.${index}.text`]
          return (
            <div key={step.key} className="space-y-2 rounded-item border border-line p-3">
              <div className="flex gap-2">
                <span className="self-center text-sm font-bold text-ink-muted">{index + 1}</span>
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
                  <Icon name="arrowUp" size={18} />
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
                  <Icon name="close" size={18} />
                </Button>
              </div>
              <textarea
                value={step.text}
                onChange={(e) => setStep(step.key, { text: e.target.value })}
                rows={2}
                aria-label={`手順 ${index + 1}`}
                className={inputClass}
              />
              {err && <p className="text-xs text-danger">{err}</p>}
            </div>
          )
        })}
        <Button
          variant="add"
          onClick={() =>
            set('steps', [
              ...form.steps,
              { key: newKey(), phase: form.steps.at(-1)?.phase ?? 'prep', text: '' } satisfies StepRow,
            ])
          }
        >
          <Icon name="plus" size={18} strokeWidth={2} />
          手順を追加
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
              このレシピを削除
            </Button>
          )}
          {deleteError && <p className="mt-2 text-sm text-danger">{deleteError}</p>}
        </div>
      )}
    </form>
  )
}
