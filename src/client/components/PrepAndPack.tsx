import { useState } from 'react'
import { useNavigate } from 'react-router'
import type { KitDraft, KitLocation } from '../../shared/domain/prep'
import { ApiRequestError } from '../api/client'
import { usePrepPreview, useSaveKits } from '../api/kits'
import { Button } from './form'

const errorMessage = (err: unknown, fallback: string) => (err instanceof ApiRequestError ? err.message : fallback)
const fmt = (n: number | null, unit: string) => (n === null ? '少々' : `${Math.round(n * 100) / 100}${unit}`)
const shortDate = (iso: string) => iso.slice(5).replace('-', '/')

function StepTabs({ step, onChange }: { step: 'prep' | 'pack'; onChange: (s: 'prep' | 'pack') => void }) {
  const tab = (value: 'prep' | 'pack', label: string) => (
    <button
      type="button"
      onClick={() => onChange(value)}
      aria-pressed={step === value}
      className={`min-h-10 flex-1 rounded-lg text-sm font-bold ${
        step === value ? 'bg-white text-orange-700 shadow-sm' : 'text-stone-500'
      }`}
    >
      {label}
    </button>
  )
  return (
    <div className="mb-4 flex gap-1 rounded-xl bg-stone-200 p-1">
      {tab('prep', '1. 下ごしらえ')}
      {tab('pack', '2. 袋詰め')}
    </div>
  )
}

/** S05 下ごしらえ。チェックは画面上だけ（進み具合の目印） */
function PrepStep({
  data,
  onNext,
}: {
  data: NonNullable<ReturnType<typeof usePrepPreview>['data']>
  onNext: () => void
}) {
  const [done, setDone] = useState<Set<string>>(new Set())
  const toggle = (id: string) =>
    setDone((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const { cutNow, keepWhole, asIs } = data.prep
  return (
    <>
      <section className="mb-5">
        <h2 className="mb-2 text-sm font-bold text-stone-500">今切るもの</h2>
        {cutNow.length === 0 ? (
          <p className="text-sm text-stone-500">ありません</p>
        ) : (
          <ul className="divide-y divide-stone-200 overflow-hidden rounded-xl border border-stone-200 bg-white">
            {cutNow.map((c) => {
              const on = done.has(c.ingredientId)
              return (
                <li key={c.ingredientId}>
                  <button
                    type="button"
                    onClick={() => toggle(c.ingredientId)}
                    aria-pressed={on}
                    className="flex w-full gap-3 px-4 py-3 text-left"
                  >
                    <span
                      className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border-2 text-sm ${
                        on ? 'border-green-600 bg-green-600 text-white' : 'border-stone-300'
                      }`}
                    >
                      {on ? '✓' : ''}
                    </span>
                    <span className={`min-w-0 ${on ? 'text-stone-400' : ''}`}>
                      <span className="font-bold">
                        {c.name} {c.totalQuantity !== null && fmt(c.totalQuantity, c.unit)}
                      </span>
                      <span className="block text-sm">
                        {c.uses.map((u) => (
                          <span key={`${u.recipeTitle}-${u.cutStyle}`} className="block">
                            ・{u.recipeTitle}用 {u.cutStyle} {u.quantity !== null && fmt(u.quantity, c.unit)}
                          </span>
                        ))}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {keepWhole.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 text-sm font-bold text-stone-500">切らずに残すもの（直前に作業する）</h2>
          <ul className="divide-y divide-stone-200 rounded-xl border border-sky-200 bg-sky-50">
            {keepWhole.map((k) => (
              <li key={`${k.recipeTitle}-${k.ingredientId}`} className="px-4 py-3 text-sm">
                <span className="font-bold">
                  {k.name} {fmt(k.quantity, k.unit)}
                </span>
                <span className="block text-stone-600">
                  {k.task}（{k.recipeTitle}・{shortDate(k.plannedOn)}）
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {asIs.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 text-sm font-bold text-stone-500">切らずにそのまま袋へ</h2>
          <p className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm">
            {asIs.map((a) => `${a.name} ${fmt(a.quantity, a.unit)}（${a.recipeTitle}）`).join('、')}
          </p>
        </section>
      )}

      <Button onClick={onNext} className="w-full">
        下ごしらえ完了 → 袋詰めへ
      </Button>
    </>
  )
}

function KitCard({
  kit,
  onLocation,
  disabled,
}: {
  kit: KitDraft
  onLocation: (l: KitLocation) => void
  disabled: boolean
}) {
  const packed = kit.items.filter((i) => i.state === 'packed')
  const seasonings = kit.items.filter((i) => i.state === 'seasoning_packed')
  const beforeCook = kit.items.filter((i) => i.state === 'before_cook')
  const locButton = (l: KitLocation, label: string) => (
    <button
      type="button"
      onClick={() => onLocation(l)}
      disabled={disabled}
      aria-pressed={kit.location === l}
      className={`min-h-9 flex-1 rounded-full border px-3 text-sm ${
        kit.location === l
          ? 'border-sky-600 bg-sky-600 font-bold text-white'
          : 'border-stone-300 bg-white text-stone-700'
      }`}
    >
      {label}
    </button>
  )
  return (
    <li className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="mb-1 text-xs text-stone-500">
        {shortDate(kit.plannedOn)} に食べる ・ {kit.servings}食
      </div>
      <h3 className="mb-2 font-bold">{kit.title}</h3>
      <fieldset className="mb-2 flex gap-2">
        <legend className="sr-only">{kit.title}の保存場所</legend>
        {locButton('fridge', '❄️ 冷蔵')}
        {locButton('freezer', '🧊 冷凍')}
      </fieldset>
      <p className="mb-2 text-sm text-stone-600">
        使用期限 {shortDate(kit.useBy)}
        {kit.location !== kit.defaultLocation && (
          <span className="text-xs text-stone-500">
            （おすすめは{kit.defaultLocation === 'fridge' ? '冷蔵' : '冷凍'}）
          </span>
        )}
      </p>
      {kit.warnings.map((w) => (
        <p key={w} className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          ⚠️ {w}
        </p>
      ))}
      <div className="space-y-1 text-sm">
        <p>
          <span className="text-xs font-bold text-stone-500">袋に入れる: </span>
          {packed.length === 0 ? 'なし' : packed.map((i) => `${i.name} ${fmt(i.quantity, i.unit)}`).join('、')}
        </p>
        {seasonings.length > 0 && (
          <p>
            <span className="text-xs font-bold text-stone-500">調味料も入れる: </span>
            {seasonings.map((i) => `${i.name} ${fmt(i.quantity, i.unit)}`).join('、')}
          </p>
        )}
        {beforeCook.length > 0 && (
          <div>
            <span className="text-xs font-bold text-stone-500">作る直前に:</span>
            <ul>
              {beforeCook.map((i) => (
                <li key={i.ingredientId} className="text-sky-800">
                  ・{i.name} {fmt(i.quantity, i.unit)} … {i.beforeCookTask}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </li>
  )
}

/** 下ごしらえ中の献立: S05 下ごしらえ → S06 袋詰め */
export function PrepAndPack({ planId }: { planId: string }) {
  const [step, setStep] = useState<'prep' | 'pack'>('prep')
  const [locations, setLocations] = useState<Record<string, KitLocation>>({})
  const preview = usePrepPreview(planId, locations)
  const save = useSaveKits(planId)
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  async function onSave() {
    setError(null)
    try {
      // 画面に出ている保存場所をそのまま送る
      const all = Object.fromEntries((preview.data?.kits ?? []).map((k) => [k.recipeId, k.location]))
      await save.mutateAsync({ ...all, ...locations })
      navigate('/fridge')
    } catch (err) {
      setError(errorMessage(err, '保存できませんでした'))
    }
  }

  if (preview.isPending) return <p className="text-stone-500">読み込み中…</p>
  if (preview.isError || !preview.data) return <p className="text-red-600">読み込めませんでした</p>
  const data = preview.data

  return (
    <section>
      <StepTabs step={step} onChange={setStep} />
      {data.shortages.length > 0 && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          在庫に足りないもの:{' '}
          {data.shortages
            .map((s) => `${s.name} ${fmt(s.quantity, s.unit)}${s.kind === 'before_cook' ? '（直前に使う分）' : ''}`)
            .join('、')}
          。買い足すか、冷蔵庫から量を直してください（このままでも保存はできます）
        </p>
      )}
      {step === 'prep' ? (
        <PrepStep data={data} onNext={() => setStep('pack')} />
      ) : (
        <>
          <ul className="mb-4 space-y-3">
            {data.kits.map((k) => (
              <KitCard
                key={k.recipeId}
                kit={k}
                disabled={preview.isFetching || save.isPending}
                onLocation={(l) => setLocations((cur) => ({ ...cur, [k.recipeId]: l }))}
              />
            ))}
          </ul>
          {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
          <Button onClick={onSave} disabled={save.isPending || preview.isFetching} className="w-full">
            {save.isPending ? '保存しています…' : '袋を保存して冷蔵庫へ'}
          </Button>
          <p className="mt-2 text-xs text-stone-500">
            袋に入れた分は在庫から減らします。直前に使う分は袋用に確保します
          </p>
        </>
      )}
    </section>
  )
}
