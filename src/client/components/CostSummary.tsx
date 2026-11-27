import { useState } from 'react'
import { Link } from 'react-router'
import { STAPLE_COST_PER_MEAL_YEN } from '../../shared/domain/constants'
import type { Cost, ShoppingCost } from '../../shared/domain/cost'

/** 金額は目安なので、いつも「約」を付ける（docs/design/10-cost.md） */
export function yenText(yen: number): string {
  return `約 ${yen.toLocaleString('ja-JP')} 円`
}

const unpricedText = (cost: Cost) => (cost.hasUnpriced ? `（${cost.unpricedCount} 品未設定）` : '')

/** 提案カードの「約 2,380 円 · 1 食 約 410 円（3 品未設定）」 */
export function ProposalCost({ cost }: { cost: Cost }) {
  return (
    <span className="text-right text-[13px] text-ink-soft">
      <span className="font-bold text-ink">{yenText(cost.buyYen)}</span>
      {cost.perMealYen !== null && ` · 1 食 ${yenText(cost.perMealYen)}`}
      {cost.hasUnpriced && <span className="text-xs text-ink-muted">{unpricedText(cost)}</span>}
    </span>
  )
}

/** 買い物リストの上のまとめ: 今回買う分・1 食あたり・冷蔵庫から・余り・未設定の食材 */
export function ShoppingCostSummary({ cost }: { cost: ShoppingCost }) {
  const [open, setOpen] = useState(false)
  return (
    <section aria-label="推定金額" className="flex flex-col gap-1 rounded-item bg-surface px-4 py-3 shadow-card">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-xl font-bold tabular-nums">{yenText(cost.buyYen)}</span>
        <span className="text-[13px] text-ink-muted">
          今回買う分
          {cost.remainingYen !== cost.buyYen && `（あと ${yenText(cost.remainingYen)}）`}
        </span>
      </p>
      {cost.perMealYen !== null && (
        <p className="text-[13px]">
          1 食あたり <span className="font-bold">{yenText(cost.perMealYen)}</span>
          <span className="text-ink-muted">
            （{cost.totalMeals} 食・調味料など {STAPLE_COST_PER_MEAL_YEN} 円込み）
          </span>
        </p>
      )}
      <p className="text-xs text-ink-muted">
        冷蔵庫から {yenText(cost.fromFridgeYen)}分 ・ 余り {yenText(cost.leftoverYen)}分
        {cost.leftoverPerishableYen > 0 && `（うち傷みやすい ${yenText(cost.leftoverPerishableYen)}）`}
      </p>
      {cost.hasUnpriced && (
        <div>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="min-h-9 text-xs font-bold text-accent"
          >
            {cost.unpricedCount} 品は価格未設定 {open ? '▴' : '›'}
          </button>
          {open && (
            <ul className="flex flex-wrap gap-1.5">
              {cost.unpriced.map((u) => (
                <li key={u.ingredientId}>
                  <Link
                    to={`/ingredients/${u.ingredientId}`}
                    className="inline-block rounded-full bg-pantry-soft px-2.5 py-1 text-xs text-ink-soft"
                  >
                    {u.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
