import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { shortDate } from '../../shared/domain/date'
import type { KitDraft, KitLocation } from '../../shared/domain/prep'
import { ApiRequestError } from '../api/client'
import { usePrepPreview, useSaveKits } from '../api/kits'
import { Button } from './form'
import { Icon } from './Icon'
import { PlanProgress } from './PlanProgress'
import { StickyAction } from './StickyAction'

const errorMessage = (err: unknown, fallback: string) => (err instanceof ApiRequestError ? err.message : fallback)
const fmt = (n: number | null, unit: string) => (n === null ? '少々' : `${Math.round(n * 100) / 100}${unit}`)

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
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-bold text-ink-muted">今切るもの</h2>
          {cutNow.length > 0 && (
            <p className="text-[13px] font-bold tabular-nums">
              {cutNow.filter((c) => done.has(c.ingredientId)).length} / {cutNow.length} 済み
            </p>
          )}
        </div>
        {cutNow.length === 0 ? (
          <p className="text-sm text-ink-muted">ありません</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {cutNow.map((c) => {
              const on = done.has(c.ingredientId)
              return (
                <li key={c.ingredientId}>
                  <button
                    type="button"
                    onClick={() => toggle(c.ingredientId)}
                    aria-pressed={on}
                    className="flex w-full items-start gap-3 rounded-item border border-line bg-surface px-4 py-3.5 text-left"
                  >
                    <span
                      className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border-2 ${
                        on ? 'border-leaf bg-leaf text-white' : 'border-line-strong bg-surface'
                      }`}
                    >
                      {on && <Icon name="check" size={16} strokeWidth={2.8} />}
                    </span>
                    <span className={`flex min-w-0 flex-1 flex-col gap-2 ${on ? 'opacity-60' : ''}`}>
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={`text-base font-bold ${on ? 'line-through' : ''}`}>{c.name}</span>
                        {c.totalQuantity !== null && (
                          <span className="text-sm text-ink-muted">{fmt(c.totalQuantity, c.unit)}</span>
                        )}
                      </span>
                      <span className="flex flex-wrap gap-1.5">
                        {c.uses.map((u) => (
                          <span
                            key={`${u.recipeTitle}-${u.cutStyle}`}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-ground px-2.5 py-1 text-[13px]"
                          >
                            <span className="font-bold">
                              {u.cutStyle} {u.quantity !== null && fmt(u.quantity, c.unit)}
                            </span>
                            <span className="text-ink-muted">{u.recipeTitle}</span>
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
        <section className="flex flex-col gap-2.5">
          <h2 className="text-sm font-bold text-ink-muted">切らずに残すもの</h2>
          <p className="text-[13px] text-ink-muted">作る直前に作業します。袋には入れずに冷蔵庫へ。</p>
          <ul className="flex flex-col gap-2">
            {keepWhole.map((k) => (
              <li
                key={`${k.recipeTitle}-${k.ingredientId}`}
                className="flex flex-col gap-1 rounded-item border border-frozen/20 bg-frozen-soft px-4 py-3.5 text-sm"
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-base font-bold">{k.name}</span>
                  <span className="text-ink-muted">{fmt(k.quantity, k.unit)}</span>
                </span>
                <span className="flex items-center gap-1.5 text-frozen">
                  <Icon name="clock" size={16} />
                  {k.task} ・ {k.recipeTitle}（{shortDate(k.plannedOn)}）
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {asIs.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-sm font-bold text-ink-muted">切らずにそのまま袋へ</h2>
          <p className="rounded-item border border-line bg-surface px-4 py-3 text-sm">
            {asIs.map((a) => `${a.name} ${fmt(a.quantity, a.unit)}（${a.recipeTitle}）`).join('、')}
          </p>
        </section>
      )}

      <StickyAction hint="次に、料理ごとに袋に分けます">
        <Button onClick={onNext} className="min-h-13 w-full text-base">
          下ごしらえ完了
        </Button>
      </StickyAction>
    </div>
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
  const frozen = kit.location === 'freezer'
  const locButton = (l: KitLocation, label: string) => {
    const on = kit.location === l
    return (
      <button
        type="button"
        onClick={() => onLocation(l)}
        disabled={disabled}
        aria-pressed={on}
        className={`min-h-9 rounded-lg px-3.5 text-[13px] ${
          on
            ? `bg-surface font-bold shadow-[0_1px_2px_rgba(60,40,20,0.12)] ${l === 'freezer' ? 'text-frozen' : 'text-ink'}`
            : 'font-medium text-ink-soft'
        }`}
      >
        {label}
      </button>
    )
  }
  const warn = kit.warnings.length > 0
  return (
    <li className="overflow-hidden rounded-card border border-line bg-surface">
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-xs text-ink-muted">
              {shortDate(kit.plannedOn)} に食べる ・ {kit.servings}食分
            </span>
            <h3 className="line-clamp-2 text-lg font-bold">{kit.title}</h3>
          </div>
          <fieldset className="flex shrink-0 gap-0.5 rounded-[10px] bg-sunken p-[3px]">
            <legend className="sr-only">{kit.title}の保存場所</legend>
            {locButton('fridge', '冷蔵')}
            {locButton('freezer', '冷凍')}
          </fieldset>
        </div>
        <div className="flex flex-col gap-1.5 rounded-xl bg-ground px-3.5 py-3 text-sm">
          <p className="text-xs font-bold text-ink-muted">中身</p>
          <p>{packed.length === 0 ? 'なし' : packed.map((i) => `${i.name} ${fmt(i.quantity, i.unit)}`).join(' ・ ')}</p>
          {seasonings.length > 0 && (
            <p className="text-[13px]">
              <span className="text-ink-muted">袋に入れる調味料：</span>
              {seasonings.map((i) => `${i.name} ${fmt(i.quantity, i.unit)}`).join(' ・ ')}
            </p>
          )}
          {beforeCook.map((i) => (
            <p key={i.ingredientId} className="text-[13px]">
              <span className="text-ink-muted">直前作業：</span>
              {i.name} {fmt(i.quantity, i.unit)} … {i.beforeCookTask}
            </p>
          ))}
        </div>
        {kit.location !== kit.defaultLocation && (
          <p className="text-xs text-ink-muted">おすすめは{kit.defaultLocation === 'fridge' ? '冷蔵' : '冷凍'}です</p>
        )}
      </div>
      <div
        className={`flex items-center justify-between border-t border-line-soft px-4 py-3 text-sm ${warn ? 'bg-danger-wash' : ''}`}
      >
        <span className="text-ink-muted">使用期限</span>
        <span className={`font-bold ${warn ? 'text-danger' : ''}`}>
          {shortDate(kit.useBy)}（{frozen ? '冷凍' : '冷蔵'}）
        </span>
      </div>
      {kit.warnings.map((w) => (
        <p key={w} className="flex items-start gap-2 bg-danger-wash px-4 pb-3 text-[13px] text-danger">
          <Icon name="warning" size={16} strokeWidth={2} className="mt-0.5" />
          {w}
        </p>
      ))}
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
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  async function onSave() {
    setError(null)
    try {
      // 画面に出ている保存場所をそのまま送る
      const all = Object.fromEntries((preview.data?.kits ?? []).map((k) => [k.recipeId, k.location]))
      await save.mutateAsync({ ...all, ...locations })
      navigate('/fridge')
    } catch (err) {
      // 二重送信の 2 本目: もう保存されているので冷蔵庫へ
      if (err instanceof ApiRequestError && err.status === 409) {
        await qc.invalidateQueries({ queryKey: ['plans', 'current'] })
        navigate('/fridge')
        return
      }
      setError(errorMessage(err, '保存できませんでした'))
    }
  }

  const progress = <PlanProgress current={step} />
  if (preview.isPending)
    return (
      <>
        {progress}
        <p className="text-ink-muted">読み込み中…</p>
      </>
    )
  if (preview.isError || !preview.data)
    return (
      <>
        {progress}
        <p className="text-danger">読み込めませんでした</p>
      </>
    )
  const data = preview.data

  return (
    <section>
      {progress}
      {data.shortages.length > 0 && (
        <p className="mb-5 flex items-start gap-2 rounded-xl bg-danger-wash px-3.5 py-3 text-sm text-danger">
          <Icon name="warning" size={16} strokeWidth={2} className="mt-0.5" />
          <span>
            在庫に足りないもの:{' '}
            {data.shortages
              .map((s) => `${s.name} ${fmt(s.quantity, s.unit)}${s.kind === 'before_cook' ? '（直前に使う分）' : ''}`)
              .join('、')}
            。買い足すか、冷蔵庫から量を直してください（このままでも保存はできます）
          </span>
        </p>
      )}
      {step === 'prep' ? (
        <PrepStep data={data} onNext={() => setStep('pack')} />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm text-ink-soft">
              {data.kits.length} つの袋に分けて保存します。冷蔵 / 冷凍は変えられます。
            </p>
            <button type="button" onClick={() => setStep('prep')} className="min-h-8 shrink-0 text-sm text-accent">
              下ごしらえに戻る
            </button>
          </div>
          <ul className="flex flex-col gap-3">
            {data.kits.map((k) => (
              <KitCard
                key={k.recipeId}
                kit={k}
                disabled={preview.isFetching || save.isPending}
                onLocation={(l) => setLocations((cur) => ({ ...cur, [k.recipeId]: l }))}
              />
            ))}
          </ul>
          <StickyAction hint="袋に入れた分は在庫から減らします。直前に使う分は袋用に確保します">
            {error && <p className="text-center text-sm text-danger">{error}</p>}
            <Button
              onClick={onSave}
              disabled={save.isPending || preview.isFetching}
              className="min-h-13 w-full text-base"
            >
              {save.isPending ? '保存しています…' : '保存完了'}
            </Button>
          </StickyAction>
        </div>
      )}
    </section>
  )
}
