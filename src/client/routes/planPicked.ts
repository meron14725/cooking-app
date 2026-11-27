import { MAX_SERVINGS_PER_DISH } from '../../shared/domain/constants'
import { readSession, writeSession } from '../sessionState'

/** 献立を組むで選んだ「食べたい料理」 */
export type Picked = { recipeId: string; title: string; servings: number }

const PICKED_KEY = 'plan-picked'

export const isPicked = (v: unknown): v is Picked => {
  if (typeof v !== 'object' || v === null) return false
  const p = v as Record<string, unknown>
  return (
    typeof p.recipeId === 'string' &&
    p.recipeId !== '' &&
    typeof p.title === 'string' &&
    typeof p.servings === 'number' &&
    Number.isFinite(p.servings) &&
    p.servings > 0 &&
    p.servings <= MAX_SERVINGS_PER_DISH
  )
}
export const isPickedList = (v: unknown): v is Picked[] => Array.isArray(v) && v.every(isPicked)

/** このタブで覚えている選択。形が違えば空 */
export const loadPicked = (): Picked[] => readSession(PICKED_KEY, isPickedList) ?? []
export const savePicked = (v: Picked[]) => writeSession(PICKED_KEY, v.length === 0 ? null : v)

/** 今あるレシピに無い（削除された）料理を外す。変わらなければ同じ配列を返す */
export function dropMissing(picked: Picked[], existingIds: ReadonlySet<string>): Picked[] {
  return picked.every((p) => existingIds.has(p.recipeId)) ? picked : picked.filter((p) => existingIds.has(p.recipeId))
}
