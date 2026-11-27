import { useState } from 'react'
import { CATEGORY_OPTIONS } from '../../shared/schemas/ingredient'
import type { ShoppingItem } from '../../shared/schemas/shopping'
import { ApiRequestError } from '../api/client'
import { useIngredients } from '../api/ingredients'
import {
  useAddShoppingItem,
  useCompleteShopping,
  useDeleteShoppingItem,
  useShoppingList,
  useToggleShoppingItem,
  useUpdateShoppingItem,
} from '../api/shopping'
import { Button, inputBaseClass, parseNumber } from './form'
import { IngredientSelect } from './ingredientInputs'

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
    <div className="space-y-2 border-t border-stone-100 bg-stone-50 px-4 py-3">
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
      {item.checkedAt && <p className="text-xs text-stone-500">在庫に入れた量も合わせて直します</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
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
          className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-4 py-2 text-left"
        >
          <span
            className={`flex size-7 shrink-0 items-center justify-center rounded-md border-2 text-base ${
              checked ? 'border-green-600 bg-green-600 text-white' : 'border-stone-300 bg-white'
            }`}
          >
            {checked ? '✓' : ''}
          </span>
          <span className={`min-w-0 ${checked ? 'text-stone-400 line-through' : ''}`}>
            <span className="font-bold">{item.name}</span> <span>{main}</span>
            {note && <span className="text-xs text-stone-500">（{note}）</span>}
            <span className="block truncate text-xs text-stone-400 no-underline">
              {item.isManual ? '手で追加' : item.usedFor.join('・')}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={`${item.name}を直す`}
          className="min-h-11 shrink-0 px-2 text-sm text-orange-700"
        >
          直す
        </button>
      </div>
      {toggle.isError && <p className="px-4 pb-2 text-xs text-red-600">通信できませんでした。もう一度押してください</p>}
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
    <div className="mb-4 space-y-2 rounded-xl border border-orange-200 bg-orange-50 p-4">
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
      {error && <p className="text-sm text-red-600">{error}</p>}
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
export function ShoppingListView({ planId }: { planId: string }) {
  const { data, isPending, isError } = useShoppingList(planId)
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

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-bold text-stone-500">
          買い物リスト{data && data.length > 0 && `（${data.length - unchecked}/${data.length}）`}
        </h2>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="text-sm text-orange-700">
            ＋ 手で足す
          </button>
        )}
      </div>
      {adding && <AddForm planId={planId} onDone={() => setAdding(false)} />}
      {isPending && <p className="text-stone-500">読み込み中…</p>}
      {isError && <p className="text-red-600">読み込めませんでした</p>}
      {data && data.length === 0 && <p className="mb-4 text-stone-500">買うものはありません。在庫で足ります</p>}
      {data &&
        CATEGORY_OPTIONS.map((cat) => {
          const items = data.filter((i) => i.category === cat.value)
          if (items.length === 0) return null
          return (
            <div key={cat.value} className="mb-3">
              <h3 className="mb-1 text-xs font-bold text-stone-500">{cat.label}</h3>
              <ul className="divide-y divide-stone-200 overflow-hidden rounded-xl border border-stone-200 bg-white">
                {items.map((i) => (
                  <Row key={i.id} planId={planId} item={i} />
                ))}
              </ul>
            </div>
          )
        })}
      {data && (
        <>
          {unchecked > 0 && data.length > 0 && (
            <p className="mt-4 text-sm text-stone-500">
              チェックしていないものが {unchecked} 件あります。買わなかったものはそのままで完了できます
            </p>
          )}
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <Button onClick={onComplete} disabled={complete.isPending} className="mt-3 w-full">
            買い物完了
          </Button>
        </>
      )}
    </section>
  )
}
