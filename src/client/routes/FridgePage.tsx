import { useState } from 'react'
import { Link } from 'react-router'
import { shortDate, todayJst } from '../../shared/domain/date'
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
import { Icon, type IconName } from '../components/Icon'
import { IngredientSelect, unitChoices } from '../components/ingredientInputs'
import { PageHeader } from '../components/PageHeader'
import { Segmented } from '../components/Segmented'

const errorMessage = (err: unknown, fallback: string) => (err instanceof ApiRequestError ? err.message : fallback)

/** 種類の絞り込み（丸いチップ） */
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
      {options.map((o) => {
        const on = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={on}
            className={`min-h-9 rounded-full border px-3.5 text-[13px] ${
              on ? 'border-ink bg-ink font-bold text-white' : 'border-line-strong bg-surface font-medium text-ink-soft'
            }`}
          >
            {o.label}
          </button>
        )
      })}
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
    <div className="space-y-3 rounded-card border border-accent-line bg-accent-wash p-4">
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
        <label className="text-xs text-ink-soft">
          買った日
          <input
            type="date"
            value={purchasedOn}
            onChange={(e) => setPurchasedOn(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="text-xs text-ink-soft">
          期限（空なら自動）
          <input
            type="date"
            value={expiresOn}
            min={purchasedOn}
            onChange={(e) => setExpiresOn(e.target.value)}
            className={inputClass}
          />
        </label>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
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
  const typed = parseNumber(quantity)
  const reservedShort = typed !== null && typed < item.reservedQuantity

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
    <div className="space-y-2 border-t border-line-soft bg-ground px-4 py-3">
      <div className="flex gap-2">
        <label className="min-w-0 flex-1 text-xs text-ink-soft">
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
        <label className="w-28 shrink-0 text-xs text-ink-soft">
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
      <label className="block text-xs text-ink-soft">
        期限{location !== item.location && expiresOn === item.expiresOn ? '（場所を変えると計算し直します）' : ''}
        <input
          type="date"
          value={expiresOn}
          min={item.purchasedOn}
          onChange={(e) => setExpiresOn(e.target.value)}
          className={inputClass}
        />
      </label>
      <p className="text-xs text-ink-muted">買った日: {item.purchasedOn}</p>
      {item.reservedQuantity > 0 && (
        <p className={`text-xs ${reservedShort ? 'font-bold text-danger' : 'text-frozen'}`}>
          うち {item.reservedQuantity}
          {item.unit} は {item.reservedFor.join('、')} 用に確保しています
          {reservedShort && '。この量だと袋の分が足りません'}
        </p>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
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

const LOCATION_ICON = {
  fridge: { icon: 'chilled', className: 'bg-leaf-soft text-leaf' },
  freezer: { icon: 'frozen', className: 'bg-frozen-soft text-frozen' },
  pantry: { icon: 'pantry', className: 'bg-pantry-soft text-pantry' },
} as const satisfies Record<StorageLocation, { icon: IconName; className: string }>

function EntryIcon({ entry }: { entry: FridgeEntry }) {
  const { icon, className } =
    entry.kind === 'meal_kit'
      ? { icon: 'bag' as const, className: 'bg-accent-soft text-accent' }
      : LOCATION_ICON[entry.location]
  return (
    <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${className}`}>
      <Icon name={icon} />
    </span>
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
    <span className="flex items-center gap-3">
      <EntryIcon entry={entry} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-bold">{entry.name}</span>
        <span className="mt-0.5 block truncate text-xs text-ink-muted">
          {entry.kind === 'meal_kit' && '袋 ・ '}
          {locationLabel(entry.location)}
          {entry.quantityText && ` ・ ${entry.quantityText}`} ・ 期限 {shortDate(entry.expiresOn)}
          {entry.plannedOn && ` ・ ${shortDate(entry.plannedOn)} に食べる`}
        </span>
        {entry.reservedFor && <span className="mt-0.5 block truncate text-xs text-frozen">{entry.reservedFor}</span>}
      </span>
      <ExpiryBadge daysLeft={entry.daysLeft} status={entry.expiryStatus} />
    </span>
  )
  return (
    <li>
      {entry.kind === 'ingredient' ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="block min-h-16 w-full px-4 py-3 text-left"
        >
          {content}
        </button>
      ) : (
        <Link to={`/kits/${entry.id}/cook`} className="block min-h-16 px-4 py-3">
          {content}
        </Link>
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
      <PageHeader title="冷蔵庫" meta={data && `期限が近い順 ・ ${data.length}件`} />

      <div className="mb-4 flex flex-col gap-3">
        <Segmented
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

      {isPending && <p className="text-ink-muted">読み込み中…</p>}
      {isError && <p className="text-danger">読み込めませんでした</p>}
      {data && data.length === 0 && (
        <p className="py-4 text-center text-sm text-ink-muted">
          {location || kind ? '該当するものはありません' : '空っぽです。買ったものは「食材を足す」から入れられます'}
        </p>
      )}
      {data && data.length > 0 && (
        <ul className="divide-y divide-line-soft overflow-hidden rounded-card border border-line bg-surface">
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

      <div className="mt-4">
        {adding ? (
          <AddStockForm onDone={() => setAdding(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex min-h-12 w-full items-center justify-center gap-1.5 rounded-control border border-dashed border-line-dashed font-bold text-ink-soft"
          >
            <Icon name="plus" size={18} strokeWidth={2} />
            食材を足す
          </button>
        )}
      </div>
    </>
  )
}
