import { useState } from 'react'
import { CATEGORY_OPTIONS } from '../../shared/schemas/ingredient'
import type { ShoppingItem } from '../../shared/schemas/shopping'
import { ApiRequestError } from '../api/client'
import { useIngredients } from '../api/ingredients'
import {
  useAddShoppingItem,
  useCompleteShopping,
  useDeleteShoppingItem,
  useSetShoppingItemPaid,
  useShoppingList,
  useToggleShoppingItem,
  useUpdateShoppingItem,
} from '../api/shopping'
import { ShoppingCostSummary, yenText } from './CostSummary'
import { Button, inputBaseClass, parseNumber } from './form'
import { Icon } from './Icon'
import { IngredientSelect } from './ingredientInputs'
import { StickyAction } from './StickyAction'

const errorMessage = (err: unknown, fallback: string) => (err instanceof ApiRequestError ? err.message : fallback)
const fmt = (n: number) => String(Math.round(n * 100) / 100)

/** 「玉ねぎ 3個入り × 1（使うのは 2個）」 */
function lineText(i: ShoppingItem): { main: string; note: string | null } {
  const main = i.packageLabel ? `${i.packageLabel} × ${i.packageCount}` : `${fmt(i.buyQuantity)}${i.unit}`
  const note = i.needQuantity > 0 && i.packageLabel ? `使うのは ${fmt(i.needQuantity)}${i.unit}` : null
  return { main, note }
}

const LOOSE = '__loose__'

/** 販売単位と個数（または量り売りの量）の入力 */
function AmountInputs({
  units,
  unitLabel,
  packageUnitId,
  setPackageUnitId,
  count,
  setCount,
  quantity,
  setQuantity,
}: {
  units: { id: string; label: string }[]
  unitLabel: string
  packageUnitId: string
  setPackageUnitId: (v: string) => void
  count: number
  setCount: (v: number) => void
  quantity: string
  setQuantity: (v: string) => void
}) {
  return (
    <div className="flex gap-2">
      <select
        value={packageUnitId}
        onChange={(e) => setPackageUnitId(e.target.value)}
        aria-label="販売単位"
        className={`${inputBaseClass} min-w-0 flex-1`}
      >
        {units.map((u) => (
          <option key={u.id} value={u.id}>
            {u.label}
          </option>
        ))}
        <option value={LOOSE}>量り売り・バラ（{unitLabel}）</option>
      </select>
      {packageUnitId === LOOSE ? (
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder={`量（${unitLabel}）`}
          aria-label="量"
          className={`${inputBaseClass} w-28 shrink-0`}
        />
      ) : (
        <select
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          aria-label="個数"
          className={`${inputBaseClass} w-20 shrink-0`}
        >
          {Array.from({ length: 10 }, (_, n) => n + 1).map((n) => (
            <option key={n} value={n}>
              × {n}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

/** 払った金額（docs/design/10-cost.md「レシートや実際の値段から直す」1） */
function PaidInput({ planId, item }: { planId: string; item: ShoppingItem }) {
  const setPaid = useSetShoppingItemPaid(planId)
  const [value, setValue] = useState(item.paidYen === null ? '' : String(item.paidYen))
  const [error, setError] = useState<string | null>(null)
  const parsed = parseNumber(value)
  const changed = parsed !== item.paidYen

  async function onSave() {
    setError(null)
    if (parsed !== null && (!Number.isInteger(parsed) || parsed < 0))
      return setError('金額は 0 以上の整数で入れてください')
    try {
      await setPaid.mutateAsync({ id: item.id, paidYen: parsed })
    } catch (err) {
      setError(errorMessage(err, '保存できませんでした'))
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="払った金額（円）"
          aria-label="払った金額（円）"
          className={`${inputBaseClass} min-w-0 flex-1`}
        />
        <Button variant="secondary" onClick={onSave} disabled={!changed || setPaid.isPending}>
          金額を保存
        </Button>
      </div>
      <p className="text-xs text-ink-muted">入れると、この食材の価格（目安）も直します。0 円は合計にだけ使います</p>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  )
}

function EditPanel({ planId, item, onDone }: { planId: string; item: ShoppingItem; onDone: () => void }) {
  const update = useUpdateShoppingItem(planId)
  const remove = useDeleteShoppingItem(planId)
  const [packageUnitId, setPackageUnitId] = useState(item.packageUnitId ?? LOOSE)
  const [count, setCount] = useState(Math.max(1, item.packageCount))
  const [quantity, setQuantity] = useState(item.packageUnitId ? '' : fmt(item.buyQuantity))
  const [error, setError] = useState<string | null>(null)

  async function onSave() {
    setError(null)
    try {
      if (packageUnitId === LOOSE) {
        const q = parseNumber(quantity)
        if (q === null || q <= 0) return setError('量を入れてください')
        await update.mutateAsync({ id: item.id, packageUnitId: null, quantity: q })
      } else {
        await update.mutateAsync({ id: item.id, packageUnitId, packageCount: count })
      }
      onDone()
    } catch (err) {
      setError(errorMessage(err, '保存できませんでした'))
    }
  }

  async function onDelete() {
    try {
      await remove.mutateAsync(item.id)
    } catch (err) {
      setError(errorMessage(err, '消せませんでした'))
    }
  }

  return (
    <div className="space-y-2 border-t border-line-soft bg-ground px-4 py-3">
      <AmountInputs
        units={item.packageUnits}
        unitLabel={item.unit}
        packageUnitId={packageUnitId}
        setPackageUnitId={setPackageUnitId}
        count={count}
        setCount={setCount}
        quantity={quantity}
        setQuantity={setQuantity}
      />
      <p className="text-xs text-ink-muted">
        {item.estimatedYen === null ? '価格未設定' : `今の量で ${yenText(item.estimatedYen)}`}
      </p>
      {item.checkedAt && <p className="text-xs text-ink-muted">在庫に入れた量も合わせて直します</p>}
      {item.paidYen !== null && <p className="text-xs text-ink-muted">量を変えると、払った金額は消えます</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button onClick={onSave} disabled={update.isPending} className="flex-1">
          保存
        </Button>
        {!item.checkedAt && (
          <Button variant="danger" onClick={onDelete} disabled={remove.isPending}>
            買わない
          </Button>
        )}
      </div>
      <div className="border-t border-line-soft pt-2">
        <PaidInput planId={planId} item={item} />
      </div>
    </div>
  )
}

function Row({ planId, item }: { planId: string; item: ShoppingItem }) {
  const toggle = useToggleShoppingItem(planId)
  const [open, setOpen] = useState(false)
  const checked = item.checkedAt !== null
  const { main, note } = lineText(item)
  return (
    <li>
      <div className="flex items-center gap-1 pr-2">
        <button
          type="button"
          aria-pressed={checked}
          onClick={() => toggle.mutate({ id: item.id, checked: !checked })}
          disabled={toggle.isPending}
          className="flex min-h-15 min-w-0 flex-1 items-center gap-3 py-2 pl-3.5 text-left"
        >
          <span
            className={`flex size-6 shrink-0 items-center justify-center rounded-md border-2 ${
              checked ? 'border-leaf bg-leaf text-white' : 'border-line-strong bg-surface'
            }`}
          >
            {checked && <Icon name="check" size={16} strokeWidth={2.8} />}
          </span>
          <span className={`flex min-w-0 flex-col gap-0.5 ${checked ? 'opacity-55' : ''}`}>
            <span className={`text-base font-bold ${checked ? 'line-through' : ''}`}>
              {item.name} <span className="font-medium">{main}</span>
            </span>
            <span className="truncate text-xs text-ink-muted">
              {note && `${note} ・ `}
              {item.paidYen !== null && `払った ${item.paidYen.toLocaleString('ja-JP')} 円 ・ `}
              {item.isManual ? '手で追加' : item.usedFor.join('・')}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={`${item.name}を直す`}
          className="min-h-11 shrink-0 px-2 text-sm text-accent"
        >
          直す
        </button>
      </div>
      {toggle.isError && <p className="px-4 pb-2 text-xs text-danger">通信できませんでした。もう一度押してください</p>}
      {open && <EditPanel planId={planId} item={item} onDone={() => setOpen(false)} />}
    </li>
  )
}

function AddForm({ planId, onDone }: { planId: string; onDone: () => void }) {
  const masters = useIngredients()
  const add = useAddShoppingItem(planId)
  const [ingredientId, setIngredientId] = useState('')
  const [packageUnitId, setPackageUnitId] = useState(LOOSE)
  const [count, setCount] = useState(1)
  const [quantity, setQuantity] = useState('')
  const [error, setError] = useState<string | null>(null)
  const master = masters.data?.find((m) => m.id === ingredientId)

  async function onSubmit() {
    setError(null)
    if (!master) return setError('食材を選んでください')
    try {
      if (packageUnitId === LOOSE) {
        const q = parseNumber(quantity)
        if (q === null || q <= 0) return setError('量を入れてください')
        await add.mutateAsync({ ingredientId, quantity: q })
      } else {
        await add.mutateAsync({ ingredientId, packageUnitId, packageCount: count })
      }
      onDone()
    } catch (err) {
      setError(errorMessage(err, '追加できませんでした'))
    }
  }

  return (
    <div className="space-y-2 rounded-card bg-surface p-5 shadow-card">
      <IngredientSelect
        value={ingredientId}
        onChange={(id) => {
          const m = masters.data?.find((x) => x.id === id)
          setIngredientId(id)
          setPackageUnitId(m?.packageUnits.find((u) => u.isDefault)?.id ?? m?.packageUnits[0]?.id ?? LOOSE)
          setCount(1)
          setQuantity('')
        }}
        ingredients={masters.data ?? []}
        className="w-full"
      />
      {master && (
        <AmountInputs
          units={master.packageUnits}
          unitLabel={master.unit}
          packageUnitId={packageUnitId}
          setPackageUnitId={setPackageUnitId}
          count={count}
          setCount={setCount}
          quantity={quantity}
          setQuantity={setQuantity}
        />
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button onClick={onSubmit} disabled={add.isPending} className="flex-1">
          リストに足す
        </Button>
        <Button variant="secondary" onClick={onDone}>
          やめる
        </Button>
      </div>
    </div>
  )
}

/** S04 買い物リスト。売り場ごとに並べ、チェックすると在庫に入る */
export function ShoppingListView({ planId, dishes = [] }: { planId: string; dishes?: string[] }) {
  const list = useShoppingList(planId)
  const { isPending, isError } = list
  const data = list.data?.items
  const complete = useCompleteShopping(planId)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const unchecked = data?.filter((i) => !i.checkedAt).length ?? 0

  async function onComplete() {
    setError(null)
    try {
      await complete.mutateAsync()
    } catch (err) {
      setError(errorMessage(err, '完了にできませんでした'))
    }
  }

  const total = data?.length ?? 0
  const done = total - unchecked

  return (
    <section className="flex flex-col gap-5">
      {total > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <p className="min-w-0 text-sm text-ink-muted">{dishes.length > 0 ? dishes.join(' ・ ') : '買えたもの'}</p>
            <p className="shrink-0 text-[15px] font-bold tabular-nums">
              {done} / {total}
            </p>
          </div>
          <div
            role="progressbar"
            aria-label="買えた数"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={done}
            className="h-2 overflow-hidden rounded-full bg-line"
          >
            <div
              className="h-full rounded-full bg-leaf-bright"
              style={{ width: `${Math.round((done / total) * 100)}%` }}
            />
          </div>
        </div>
      )}
      {list.data && total > 0 && <ShoppingCostSummary cost={list.data.cost} />}
      {isPending && <p className="text-ink-muted">読み込み中…</p>}
      {isError && <p className="text-danger">読み込めませんでした</p>}
      {data && data.length === 0 && <p className="text-ink-muted">買うものはありません。在庫で足ります</p>}
      {data &&
        CATEGORY_OPTIONS.map((cat) => {
          const items = data.filter((i) => i.category === cat.value)
          if (items.length === 0) return null
          return (
            <div key={cat.value} className="flex flex-col gap-2">
              <h3 className="text-[13px] font-bold tracking-[0.04em] text-ink-muted">{cat.label}</h3>
              <ul className="divide-y divide-line-soft overflow-hidden rounded-item bg-surface shadow-card">
                {items.map((i) => (
                  <Row key={i.id} planId={planId} item={i} />
                ))}
              </ul>
            </div>
          )
        })}
      {adding ? (
        <AddForm planId={planId} onDone={() => setAdding(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex min-h-12 items-center justify-center gap-1.5 rounded-control border border-dashed border-line-dashed font-bold text-ink-soft"
        >
          <Icon name="plus" size={18} strokeWidth={2} />
          手で足す
        </button>
      )}
      {data && (
        <StickyAction
          hint={
            total === 0
              ? undefined
              : unchecked > 0
                ? `チェックしていないものが ${unchecked} 件あります。買わなかったものはそのままで完了できます`
                : 'チェックしたものは在庫に入ります'
          }
        >
          {error && <p className="text-center text-sm text-danger">{error}</p>}
          <Button onClick={onComplete} disabled={complete.isPending} className="min-h-13 w-full text-base">
            買い物完了
          </Button>
        </StickyAction>
      )}
    </section>
  )
}
