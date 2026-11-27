import { useState } from 'react'
import { todayJst } from '../../shared/domain/date'
import { toBaseQuantity } from '../../shared/domain/units'
import { LOCATION_OPTIONS, locationLabel, type StorageLocation } from '../../shared/schemas/ingredient'
import type { FridgeEntry, InventoryItem } from '../../shared/schemas/inventory'
import { ApiRequestError } from '../api/client'
import { useIngredients } from '../api/ingredients'
import {
  type FridgeFilter,
  useAddInventory,
  useFridge,
  useInventory,
  useUpdateInventory,
  useUseUpInventory,
} from '../api/inventory'
import { ExpiryBadge } from '../components/ExpiryBadge'
import { Button, inputBaseClass, inputClass, parseNumber } from '../components/form'
import { IngredientSelect, unitChoices } from '../components/ingredientInputs'
import { PageHeader } from '../components/PageHeader'

const errorMessage = (err: unknown, fallback: string) => (err instanceof ApiRequestError ? err.message : fallback)

function Chips<T extends string>({
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
    <fieldset className="flex flex-wrap gap-2">
      <legend className="sr-only">{label}</legend>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`min-h-9 rounded-full border px-3 text-sm ${
            value === o.value
              ? 'border-orange-600 bg-orange-600 font-bold text-white'
              : 'border-stone-300 bg-white text-stone-700'
          }`}
        >
          {o.label}
        </button>
      ))}
    </fieldset>
  )
}

/** 手で在庫を足す（量は基準単位のほか g などでも入れられる。期限は空なら自動） */
function AddStockForm({ onDone }: { onDone: () => void }) {
  const masters = useIngredients()
  const add = useAddInventory()
  const [ingredientId, setIngredientId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('')
  const [location, setLocation] = useState<StorageLocation | ''>('')
  const [purchasedOn, setPurchasedOn] = useState(todayJst())
  const [expiresOn, setExpiresOn] = useState('')
  const [error, setError] = useState<string | null>(null)

  const master = masters.data?.find((m) => m.id === ingredientId)
  const choices = unitChoices(master)

  async function onSubmit() {
    setError(null)
    if (!master) return setError('食材を選んでください')
    const amount = parseNumber(quantity)
    if (amount === null || amount <= 0) return setError('量を入れてください')
    const converted =
      unit && unit !== master.unit ? toBaseQuantity({ quantity: amount, unit }, master) : { quantity: amount }
    if (converted.quantity === null) return setError('単位を直せませんでした')
    try {
      await add.mutateAsync({
        ingredientId,
        quantity: converted.quantity,
        location: location || undefined,
        purchasedOn,
        expiresOn: expiresOn || undefined,
      })
      onDone()
    } catch (err) {
      setError(errorMessage(err, '追加できませんでした'))
    }
  }

  return (
    <div className="mb-4 space-y-3 rounded-xl border border-orange-200 bg-orange-50 p-4">
      <IngredientSelect
        value={ingredientId}
        onChange={(id) => {
          const m = masters.data?.find((x) => x.id === id)
          setIngredientId(id)
          setUnit(m?.unit ?? '')
          setLocation(m?.defaultLocation ?? '')
        }}
        ingredients={masters.data ?? []}
        className="w-full"
      />
      <div className="flex gap-2">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="量"
          aria-label="量"
          className={`${inputBaseClass} min-w-0 flex-1`}
        />
        <select
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
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
        <select
          value={location}
          onChange={(e) => setLocation(e.target.value as StorageLocation)}
          aria-label="保存場所"
          className={`${inputBaseClass} w-24 shrink-0`}
        >
          {LOCATION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value} disabled={o.value === 'freezer' && master && !master.canFreeze}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-stone-600">
          買った日
          <input
            type="date"
            value={purchasedOn}
            onChange={(e) => setPurchasedOn(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="text-xs text-stone-600">
          期限（空なら自動）
          <input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} className={inputClass} />
        </label>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button onClick={onSubmit} disabled={add.isPending} className="flex-1">
          {add.isPending ? '追加中…' : '冷蔵庫に入れる'}
        </Button>
        <Button variant="secondary" onClick={onDone}>
          やめる
        </Button>
      </div>
    </div>
  )
}

/** 在庫 1 行の修正（量・場所・期限）と使い切り */
function EditStockPanel({ item, onDone }: { item: InventoryItem; onDone: () => void }) {
  const masters = useIngredients()
  const update = useUpdateInventory()
  const useUp = useUseUpInventory()
  const master = masters.data?.find((m) => m.id === item.ingredientId)
  const [quantity, setQuantity] = useState(String(item.quantity))
  const [location, setLocation] = useState<StorageLocation>(item.location)
  const [expiresOn, setExpiresOn] = useState(item.expiresOn)
  const [error, setError] = useState<string | null>(null)

  async function onSave() {
    setError(null)
    const q = parseNumber(quantity)
    if (q === null || q < 0) return setError('量を入れてください')
    try {
      await update.mutateAsync({
        id: item.id,
        quantity: q === item.quantity ? undefined : q,
        location: location === item.location ? undefined : location,
        // 期限を触らずに場所を変えたときは、サーバ側で計算し直す
        expiresOn: expiresOn === item.expiresOn ? undefined : expiresOn,
      })
      onDone()
    } catch (err) {
      setError(errorMessage(err, '保存できませんでした'))
    }
  }

  async function onUseUp() {
    try {
      await useUp.mutateAsync(item.id)
      onDone()
    } catch (err) {
      setError(errorMessage(err, '使い切りにできませんでした'))
    }
  }

  return (
    <div className="space-y-2 border-t border-stone-100 bg-stone-50 px-4 py-3">
      <div className="flex gap-2">
        <label className="min-w-0 flex-1 text-xs text-stone-600">
          残り（{item.unit}）
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="w-28 shrink-0 text-xs text-stone-600">
          場所
          <select
            value={location}
            onChange={(e) => setLocation(e.target.value as StorageLocation)}
            className={inputClass}
          >
            {LOCATION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value} disabled={o.value === 'freezer' && master && !master.canFreeze}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-xs text-stone-600">
        期限{location !== item.location && expiresOn === item.expiresOn ? '（場所を変えると計算し直します）' : ''}
        <input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} className={inputClass} />
      </label>
      <p className="text-xs text-stone-500">買った日: {item.purchasedOn}</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button onClick={onSave} disabled={update.isPending} className="flex-1">
          保存
        </Button>
        <Button variant="danger" onClick={onUseUp} disabled={useUp.isPending}>
          使い切った
        </Button>
      </div>
    </div>
  )
}

function EntryRow({
  entry,
  item,
  open,
  onToggle,
}: {
  entry: FridgeEntry
  item: InventoryItem | undefined
  open: boolean
  onToggle: () => void
}) {
  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate font-bold">
          {entry.kind === 'meal_kit' && <span className="mr-1">🛍️</span>}
          {entry.name}
        </span>
        <ExpiryBadge daysLeft={entry.daysLeft} status={entry.expiryStatus} />
      </div>
      <div className="mt-0.5 text-xs text-stone-500">
        {locationLabel(entry.location)}
        {entry.quantityText && ` ・ ${entry.quantityText}`} ・ 期限 {entry.expiresOn.slice(5).replace('-', '/')}
        {entry.plannedOn && ` ・ ${entry.plannedOn.slice(5).replace('-', '/')} に食べる予定`}
      </div>
      {entry.reservedFor && <div className="mt-0.5 text-xs text-sky-700">{entry.reservedFor}</div>}
    </>
  )
  const tone =
    entry.expiryStatus === 'expired'
      ? 'border-l-4 border-l-red-400'
      : entry.expiryStatus === 'soon'
        ? 'border-l-4 border-l-amber-400'
        : ''
  return (
    <li className={tone}>
      {entry.kind === 'ingredient' ? (
        <button type="button" onClick={onToggle} aria-expanded={open} className="block w-full px-4 py-3 text-left">
          {content}
        </button>
      ) : (
        <div className="px-4 py-3">{content}</div>
      )}
      {open && item && <EditStockPanel item={item} onDone={onToggle} />}
    </li>
  )
}

export function FridgePage() {
  const [location, setLocation] = useState<StorageLocation | ''>('')
  const [kind, setKind] = useState<FridgeEntry['kind'] | ''>('')
  const [adding, setAdding] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const filter: FridgeFilter = { location: location || undefined, kind: kind || undefined }
  const { data, isPending, isError } = useFridge(filter)
  const inventory = useInventory()

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <PageHeader title="冷蔵庫" />
        {!adding && (
          <Button onClick={() => setAdding(true)} className="mb-4">
            ＋ 追加
          </Button>
        )}
      </div>

      {adding && <AddStockForm onDone={() => setAdding(false)} />}

      <div className="mb-4 space-y-2">
        <Chips
          label="保存場所"
          value={location}
          onChange={setLocation}
          options={[{ value: '', label: 'すべて' }, ...LOCATION_OPTIONS]}
        />
        <Chips
          label="種類"
          value={kind}
          onChange={setKind}
          options={[
            { value: '', label: 'すべて' },
            { value: 'ingredient', label: '食材' },
            { value: 'meal_kit', label: 'ミールキット' },
          ]}
        />
      </div>

      {isPending && <p className="text-stone-500">読み込み中…</p>}
      {isError && <p className="text-red-600">読み込めませんでした</p>}
      {data && data.length === 0 && (
        <p className="text-stone-500">
          {location || kind ? '当てはまるものはありません' : '空っぽです。買ったものは「＋ 追加」から入れられます'}
        </p>
      )}
      {data && data.length > 0 && (
        <ul className="divide-y divide-stone-200 overflow-hidden rounded-xl border border-stone-200 bg-white">
          {data.map((entry) => (
            <EntryRow
              key={`${entry.kind}-${entry.id}`}
              entry={entry}
              item={inventory.data?.find((i) => i.id === entry.id)}
              open={openId === entry.id}
              onToggle={() => setOpenId((cur) => (cur === entry.id ? null : entry.id))}
            />
          ))}
        </ul>
      )}
    </>
  )
}
