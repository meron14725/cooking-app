import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { splitHotcookMode } from '../../shared/domain/hotcook'
import { favoriteTotal, type Recipe, type RecipeIngredient } from '../../shared/schemas/recipe'
import { ApiRequestError } from '../api/client'
import { useCurrentPlan, useReplacePlanRecipes } from '../api/plans'
import { useRecipe, useSetRecipeFavorite } from '../api/recipes'
import { Icon } from '../components/Icon'
import { BackButton } from '../components/PageHeader'
import { RecipePhoto } from '../components/RecipePhoto'
import { StickyAction } from '../components/StickyAction'

const errorMessage = (err: unknown, fallback: string) => (err instanceof ApiRequestError ? err.message : fallback)

/** 材料を「入れる順」ごとにまとめる。順のない材料（0）は最後に「材料」として */
function groupByAddOrder(items: RecipeIngredient[]): { label: string; items: RecipeIngredient[] }[] {
  const orders = [...new Set(items.map((i) => i.addOrder))].sort((a, b) => (a || 999) - (b || 999))
  const numbered = orders.some((o) => o > 0)
  return orders.map((o) => ({
    label: o > 0 ? `${o} 番目に入れる` : numbered ? 'そのほかの材料' : '',
    items: items.filter((i) => i.addOrder === o),
  }))
}

/** 「1/2本」のような元の表記を優先し、なければ量と単位 */
function quantityText(i: RecipeIngredient): string {
  const name = i.ingredientName
  const rest = i.displayText.startsWith(name) ? i.displayText.slice(name.length).trim() : ''
  if (rest) return rest
  if (i.quantity === null) return i.displayText === name ? '' : i.displayText
  return `${Math.round(i.quantity * 100) / 100}${i.unit}`
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded-[20px] bg-surface p-3 shadow-card">
      <p className="text-[11px] text-ink-muted">{label}</p>
      <p className="mt-0.5 text-xl font-bold">
        {value}
        <span className="text-xs font-medium">{unit}</span>
      </p>
    </div>
  )
}

/** 押して自分のお気に入りを切り替える。数は取り込み元の数に自分の 1 を足したもの */
function FavoriteButton({ recipe }: { recipe: Recipe }) {
  const toggle = useSetRecipeFavorite(recipe.id)
  const on = recipe.isFavorite
  const total = favoriteTotal(recipe) ?? 0
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => toggle.mutate(!on)}
      className={`flex min-h-9 items-center gap-1.5 rounded-full pr-3.5 pl-3 text-[13px] font-bold ${
        on ? 'bg-danger-soft text-[#a63a28]' : 'bg-surface text-ink-soft shadow-card'
      }`}
    >
      <Icon name="heart" size={16} strokeWidth={1.8} className={on ? 'fill-current' : ''} />
      お気に入り {total.toLocaleString('ja-JP')}
    </button>
  )
}

/** 下の「食べたい料理に追加」。組んでいる途中の献立があればそこへ足し、なければこの料理を選んだ状態で献立を組む画面へ */
function AddToPlan({ recipe }: { recipe: Recipe }) {
  const navigate = useNavigate()
  const current = useCurrentPlan()
  const plan = current.data
  const replace = useReplacePlanRecipes(plan?.id ?? '')
  const anchors = plan?.recipes.filter((r) => r.role === 'anchor') ?? []
  const already = anchors.some((r) => r.recipeId === recipe.id)
  const busy = plan !== null && plan !== undefined && plan.status !== 'draft'

  async function onAdd() {
    if (!plan) {
      navigate('/plan', { state: { pick: { recipeId: recipe.id, title: recipe.title, servings: 1 } } })
      return
    }
    if (!already) {
      // 食べたい料理に足して、案の選び直しに戻る（選んだ案は外す）
      await replace.mutateAsync({
        recipes: [...anchors, { recipeId: recipe.id, role: 'anchor' as const, servings: 1 }].map((r, i) => ({
          recipeId: r.recipeId,
          role: 'anchor' as const,
          servings: r.servings,
          dayIndex: i + 1,
        })),
      })
    }
    navigate('/plan')
  }

  const hint = busy
    ? '買い物か下ごしらえの途中の献立があるので、終わってから追加できます'
    : plan
      ? already
        ? 'もう「食べたい料理」に入っています'
        : '組んでいる途中の献立の「食べたい料理」に追加します'
      : '「食べたい料理」に入れた状態で、献立を組む画面へ'
  return (
    <StickyAction hint={hint}>
      {replace.isError && (
        <p className="text-center text-sm text-danger">{errorMessage(replace.error, '追加できませんでした')}</p>
      )}
      <button
        type="button"
        onClick={onAdd}
        disabled={current.isPending || busy || replace.isPending}
        className="flex min-h-14 items-center justify-center gap-2 rounded-full bg-accent text-base font-bold text-white shadow-accent disabled:opacity-50"
      >
        <Icon name="calendar" size={18} strokeWidth={2} />
        {already ? '献立を組む画面へ' : '食べたい料理に追加'}
      </button>
    </StickyAction>
  )
}

/** 見るページから編集画面へ渡す state */
export type EditFromDetail = { fromDetail: true; detailInApp: boolean }

/** レシピを見るだけのページ（案D D-RecipeDetail）。編集は右上から */
export function RecipeDetailPage() {
  const { id } = useParams()
  const location = useLocation()
  const { data: recipe, isPending, isError, error } = useRecipe(id)

  if (isPending) return <p className="text-ink-muted">読み込み中…</p>
  if (isError && error instanceof ApiRequestError && error.status === 404) {
    return (
      <div className="flex flex-col items-start gap-3">
        <BackButton fallback="/recipes" />
        <p className="text-ink-soft">このレシピは削除されたか、見つかりません。</p>
        <Link to="/recipes" replace className="text-accent">
          レシピ一覧へ
        </Link>
      </div>
    )
  }
  if (isError || !recipe) return <p className="text-danger">{errorMessage(error, '読み込めませんでした')}</p>

  const { minutes, label } = splitHotcookMode(recipe.hotcookMode)
  const groups = groupByAddOrder(recipe.ingredients)
  const steps = [...recipe.steps].sort((a, b) => a.stepNo - b.stepNo)

  return (
    <>
      <header className="-mx-1 mb-2 flex items-center justify-between">
        <BackButton fallback="/recipes" />
        <Link
          to={`/recipes/${recipe.id}/edit`}
          // 編集画面で削除したとき、この見るページも履歴から飛ばせるかどうか（このページがアプリの中から開かれたか）
          state={{ fromDetail: true, detailInApp: location.key !== 'default' } satisfies EditFromDetail}
          className="flex min-h-11 items-center gap-1.5 rounded-full bg-surface pr-4 pl-3.5 text-sm font-bold text-ink shadow-[0_2px_10px_rgba(120,70,30,0.10)]"
        >
          <Icon name="pencil" size={16} strokeWidth={2} />
          編集
        </Link>
      </header>

      <div className="flex flex-col gap-5.5">
        <RecipePhoto imageKey={recipe.imageKey} className="h-65 w-full rounded-[28px]" />

        <div className="flex flex-col gap-2.5">
          <h1 className="font-display text-[28px] leading-snug font-bold">{recipe.title}</h1>
          <div className="flex flex-wrap items-center gap-2.5">
            <FavoriteButton recipe={recipe} />
            {recipe.cookCount !== null && (
              <span className="text-[13px] text-ink-soft">作った {recipe.cookCount.toLocaleString('ja-JP')}回</span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Stat label="分量" value={String(recipe.servings)} unit="人前" />
          <Stat
            label="1人前"
            value={recipe.caloriesKcal === null ? '—' : `${recipe.caloriesEstimated ? '約' : ''}${recipe.caloriesKcal}`}
            unit={recipe.caloriesKcal === null ? '' : 'kcal'}
          />
          <Stat
            label="1.6L で"
            value={recipe.maxServings1_6l === null ? '—' : String(recipe.maxServings1_6l)}
            unit={recipe.maxServings1_6l === null ? '' : '人分まで'}
          />
        </div>

        {recipe.hotcookMode && (
          <section
            aria-label="ホットクックの設定"
            className="flex items-center justify-between gap-3 rounded-[26px] bg-accent-soft px-5 py-4"
          >
            <div className="min-w-0">
              <p className="text-xs font-bold text-accent-strong">ホットクック</p>
              <p className="mt-1 text-sm font-medium">{minutes === null ? recipe.hotcookMode : label}</p>
            </div>
            {minutes !== null && (
              <p className="shrink-0 font-display text-[40px] leading-none font-bold text-accent">
                {minutes}
                <span className="text-[15px] text-ink-soft">分</span>
              </p>
            )}
          </section>
        )}

        <section className="flex flex-col gap-2.5">
          <h2 className="font-display text-xl font-bold">
            材料 <span className="text-sm font-medium text-ink-muted">（{recipe.servings}人前）</span>
          </h2>
          <div className="divide-y divide-line-soft rounded-[24px] bg-surface px-4.5 py-1.5 shadow-card">
            {groups.map((g) => (
              <div key={g.label || 'all'} className="py-3">
                {g.label && <p className="mb-1.5 text-xs font-bold text-accent-strong">{g.label}</p>}
                <ul className="flex flex-col gap-1.5">
                  {g.items.map((i) => (
                    <li key={i.id} className="flex justify-between gap-3 text-[15px]">
                      <span>
                        {i.ingredientName}
                        {i.cutStyle && <span className="text-xs text-ink-muted"> {i.cutStyle}</span>}
                      </span>
                      <span className="shrink-0 font-medium">{quantityText(i)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {steps.length > 0 && (
          <section className="flex flex-col gap-2.5">
            <h2 className="font-display text-xl font-bold">作り方</h2>
            <ol className="flex flex-col gap-2.5">
              {steps.map((s, i) => (
                <li key={s.id} className="flex gap-3 rounded-[22px] bg-surface px-4 py-3.5 shadow-card">
                  <span
                    className={`flex size-7.5 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                      s.phase === 'prep' ? 'bg-frozen-soft text-frozen' : 'bg-accent-soft text-accent-strong'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="text-[11px] font-bold text-ink-muted">
                      {s.phase === 'prep' ? '下ごしらえ' : '調理'}
                    </span>
                    <span className="text-[15px] leading-relaxed">{s.text}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>

      <AddToPlan recipe={recipe} />
    </>
  )
}
