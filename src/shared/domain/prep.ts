/**
 * 下ごしらえと袋詰め（docs/design/05-recommendation.md「下ごしらえの集約」、02-data-model.md「袋の保存場所と期限」）。
 * DB に依存しない純粋関数。
 */
import type { Category } from '../schemas/ingredient'
import { CATEGORY_OPTIONS } from '../schemas/ingredient'
import { DEFAULT_PREPPED_FREEZER_DAYS, DEFAULT_PREPPED_FRIDGE_DAYS } from './constants'
import { addDays, diffDays } from './date'
import { roundQuantity } from './units'

export type KitLocation = 'fridge' | 'freezer'
export type KitItemState = 'packed' | 'before_cook' | 'seasoning_packed'

export type PrepIngredient = {
  id: string
  name: string
  unit: string
  category: Category
  isStaple: boolean
  canFreeze: boolean
  preppedFridgeDays: number | null
  preppedFreezerDays: number | null
  beforeCookTask: string | null
}

export type PrepRecipe = {
  recipeId: string
  title: string
  /** レシピの材料が何人前か */
  recipeServings: number
  /** この献立で何食分作るか */
  servings: number
  plannedOn: string
  packSeasonings: boolean
  ingredients: { ingredientId: string; quantity: number | null; cutStyle: string | null; displayText: string }[]
}

export type KitItemDraft = {
  ingredientId: string
  name: string
  unit: string
  category: Category
  /** 基準単位（食数でスケール後）。NULL = 少々・適量 */
  quantity: number | null
  state: KitItemState
  cutStyle: string | null
  displayText: string
  /** before_cook のときの作業 */
  beforeCookTask: string | null
  /** 在庫から減らす / 確保する対象か（常備品と量のないものは対象外） */
  tracked: boolean
}

export type KitDraft = {
  recipeId: string
  title: string
  servings: number
  plannedOn: string
  location: KitLocation
  /** 食べる日から決まる保存場所の初期値 */
  defaultLocation: KitLocation
  packedOn: string
  useBy: string
  items: KitItemDraft[]
  warnings: string[]
}

const isSeasoning = (ing: PrepIngredient) => ing.isStaple || ing.category === 'seasoning'

/** 食数でスケールした材料（マスタにない食材は飛ばす） */
function scaled(recipe: PrepRecipe, ingredients: Map<string, PrepIngredient>) {
  const factor = recipe.servings / recipe.recipeServings
  return recipe.ingredients.flatMap((ri) => {
    const ing = ingredients.get(ri.ingredientId)
    if (!ing) return []
    return [{ ri, ing, quantity: ri.quantity === null ? null : roundQuantity(ri.quantity * factor) }]
  })
}

/** 袋に入りうる食材（調味料と、マスタで直前作業が決まっている食材を除く）の「切った後の冷蔵日持ち」の最小値 */
function minPreppedFridgeDays(recipe: PrepRecipe, ingredients: Map<string, PrepIngredient>): number {
  const days = scaled(recipe, ingredients)
    .filter(({ ing }) => !isSeasoning(ing) && !ing.beforeCookTask)
    .map(({ ing }) => ing.preppedFridgeDays ?? DEFAULT_PREPPED_FRIDGE_DAYS)
  return days.length > 0 ? Math.min(...days) : DEFAULT_PREPPED_FRIDGE_DAYS
}

/** 保存場所の初期値: 食べる日 − 袋詰めの日が、切った後の冷蔵日持ち以内なら冷蔵、それより先なら冷凍 */
export function defaultKitLocation(
  recipe: PrepRecipe,
  ingredients: Map<string, PrepIngredient>,
  packedOn: string,
): KitLocation {
  return diffDays(packedOn, recipe.plannedOn) <= minPreppedFridgeDays(recipe, ingredients) ? 'fridge' : 'freezer'
}

/** 1 袋の下書き。location を省略すると初期値 */
export function buildKit(
  recipe: PrepRecipe,
  ingredients: Map<string, PrepIngredient>,
  packedOn: string,
  location?: KitLocation,
): KitDraft {
  const defaultLocation = defaultKitLocation(recipe, ingredients, packedOn)
  const loc = location ?? defaultLocation
  const items: KitItemDraft[] = []
  for (const { ri, ing, quantity } of scaled(recipe, ingredients)) {
    const base = {
      ingredientId: ing.id,
      name: ing.name,
      unit: ing.unit,
      category: ing.category,
      quantity,
      cutStyle: ri.cutStyle,
      displayText: ri.displayText,
      tracked: !ing.isStaple && quantity !== null,
    }
    if (isSeasoning(ing)) {
      // 下味冷凍のレシピだけ調味料も袋へ。それ以外は調理のときに入れる（袋には入れない）
      if (recipe.packSeasonings) items.push({ ...base, state: 'seasoning_packed', beforeCookTask: null })
      continue
    }
    if (ing.beforeCookTask) {
      items.push({ ...base, state: 'before_cook', beforeCookTask: ing.beforeCookTask })
    } else if (loc === 'freezer' && !ing.canFreeze) {
      const task = ri.cutStyle ? `冷凍できないので直前に切る（${ri.cutStyle}）` : '冷凍できないので直前に入れる'
      items.push({ ...base, state: 'before_cook', beforeCookTask: task })
    } else {
      items.push({ ...base, state: 'packed', beforeCookTask: null })
    }
  }

  const packedIngredients = items
    .filter((i) => i.state === 'packed')
    .flatMap((i) => {
      const ing = ingredients.get(i.ingredientId)
      return ing ? [ing] : []
    })
  const shelfDays = packedIngredients.map((ing) =>
    loc === 'fridge'
      ? (ing.preppedFridgeDays ?? DEFAULT_PREPPED_FRIDGE_DAYS)
      : (ing.preppedFreezerDays ?? DEFAULT_PREPPED_FREEZER_DAYS),
  )
  const fallback = loc === 'fridge' ? DEFAULT_PREPPED_FRIDGE_DAYS : DEFAULT_PREPPED_FREEZER_DAYS
  const useBy = addDays(packedOn, shelfDays.length > 0 ? Math.min(...shelfDays) : fallback)

  const warnings: string[] = []
  if (useBy < recipe.plannedOn) {
    warnings.push(
      `${loc === 'fridge' ? '冷蔵' : '冷凍'}だと使用期限（${useBy.slice(5).replace('-', '/')}）が食べる日より前です`,
    )
  }
  return {
    recipeId: recipe.recipeId,
    title: recipe.title,
    servings: recipe.servings,
    plannedOn: recipe.plannedOn,
    location: loc,
    defaultLocation,
    packedOn,
    useBy,
    items,
    warnings,
  }
}

// ---------- 下ごしらえの集約 ----------

export type CutTask = {
  ingredientId: string
  name: string
  unit: string
  category: Category
  /** 合計（量のないものは除く）。全部量がなければ null */
  totalQuantity: number | null
  uses: { recipeTitle: string; cutStyle: string; quantity: number | null }[]
}

export type KeepWholeTask = {
  ingredientId: string
  name: string
  unit: string
  quantity: number | null
  recipeTitle: string
  plannedOn: string
  location: KitLocation
  task: string
}

export type AsIsItem = {
  ingredientId: string
  name: string
  unit: string
  quantity: number | null
  recipeTitle: string
}

export type PrepSummary = {
  /** 今切るもの（売り場順。肉・魚が後） */
  cutNow: CutTask[]
  /** 切らずに残すもの（食べる日順） */
  keepWhole: KeepWholeTask[]
  /** 切らずにそのまま袋へ */
  asIs: AsIsItem[]
}

const CATEGORY_ORDER = new Map<string, number>(CATEGORY_OPTIONS.map((o, i) => [o.value, i]))
const byCategory = (a: { category: Category; name: string }, b: { category: Category; name: string }) =>
  (CATEGORY_ORDER.get(a.category) ?? 99) - (CATEGORY_ORDER.get(b.category) ?? 99) || a.name.localeCompare(b.name, 'ja')

export function summarizePrep(kits: KitDraft[]): PrepSummary {
  const cut = new Map<string, CutTask>()
  const keepWhole: KeepWholeTask[] = []
  const asIs: (AsIsItem & { category: Category })[] = []
  for (const kit of kits) {
    for (const item of kit.items) {
      if (item.state === 'before_cook') {
        keepWhole.push({
          ingredientId: item.ingredientId,
          name: item.name,
          unit: item.unit,
          quantity: item.quantity,
          recipeTitle: kit.title,
          plannedOn: kit.plannedOn,
          location: kit.location,
          task: item.beforeCookTask ?? '',
        })
      } else if (item.state === 'packed' && item.cutStyle) {
        const task = cut.get(item.ingredientId) ?? {
          ingredientId: item.ingredientId,
          name: item.name,
          unit: item.unit,
          category: item.category,
          totalQuantity: null,
          uses: [],
        }
        if (item.quantity !== null) task.totalQuantity = roundQuantity((task.totalQuantity ?? 0) + item.quantity)
        task.uses.push({ recipeTitle: kit.title, cutStyle: item.cutStyle, quantity: item.quantity })
        cut.set(item.ingredientId, task)
      } else if (item.state === 'packed') {
        asIs.push({
          ingredientId: item.ingredientId,
          name: item.name,
          unit: item.unit,
          quantity: item.quantity,
          recipeTitle: kit.title,
          category: item.category,
        })
      }
    }
  }
  return {
    cutNow: [...cut.values()].sort(byCategory),
    keepWhole: keepWhole.sort((a, b) => a.plannedOn.localeCompare(b.plannedOn) || a.name.localeCompare(b.name, 'ja')),
    asIs: asIs.sort(byCategory).map(({ category: _, ...rest }) => rest),
  }
}

// ---------- 袋詰めで在庫を減らす ----------

export type StockRow = { id: string; ingredientId: string; quantity: number; expiresOn: string }

/**
 * 袋に入れる量を在庫から減らす（期限の近い行から）。
 * 戻り値は更新後の量（0 なら使い切り）と、在庫が足りなかった量
 */
export function consumeStock(
  rows: StockRow[],
  needs: { ingredientId: string; quantity: number }[],
): { updates: { id: string; quantity: number }[]; shortages: Map<string, number> } {
  const remaining = new Map(rows.map((r) => [r.id, r.quantity]))
  const sorted = [...rows].sort((a, b) => a.expiresOn.localeCompare(b.expiresOn) || a.id.localeCompare(b.id))
  const touched = new Set<string>()
  const shortages = new Map<string, number>()
  for (const need of needs) {
    let left = need.quantity
    for (const row of sorted) {
      if (left <= 1e-9) break
      if (row.ingredientId !== need.ingredientId) continue
      const have = remaining.get(row.id) ?? 0
      if (have <= 0) continue
      const take = Math.min(have, left)
      remaining.set(row.id, roundQuantity(have - take))
      touched.add(row.id)
      left = roundQuantity(left - take)
    }
    if (left > 1e-9) shortages.set(need.ingredientId, roundQuantity((shortages.get(need.ingredientId) ?? 0) + left))
  }
  return {
    updates: [...touched].map((id) => ({ id, quantity: remaining.get(id) ?? 0 })),
    shortages,
  }
}
