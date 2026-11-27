import { MAX_SERVINGS_PER_DISH, MAX_TARGET_MEALS, SERVINGS_STEP } from '../../shared/domain/constants'
import type { ExcludedProposal } from '../../shared/domain/recommend'
import type { Plan, ProposalView } from '../../shared/schemas/plan'

/**
 * 「別の案を出す」で、これまでに出した案（案ごとの料理と食数）と何回目か。
 * 食べたい料理（anchor）と食数、固定、合計◯食が変わったら、出した案は意味がなくなるので 1 回目に戻す。
 * 前のバージョンで覚えた、レシピ ID だけの案もそのまま送れる（API は古い形も受け付ける）
 */
export type ProposalRounds = { anchors: string; round: number; shown: ExcludedProposal[] }

/** 案のキー（料理と食数）。同じ料理で食数だけ違う案も別のカードにする */
export const proposalKey = (p: Pick<ProposalView, 'recipes'>) =>
  p.recipes.map((r) => `${r.recipeId}:${r.servings}`).join()

/**
 * 同じ料理の組み合わせで食数だけ違う案は、先に出てきた（点数の良い）ほうだけ残す。
 * 候補の料理が少ないと食数違いの案ばかり並ぶので、カードには出さない（食数はカードの ＋－ で変えられる）
 */
export function uniqueByRecipes<T extends Pick<ProposalView, 'recipes'>>(list: T[]): T[] {
  const seen = new Set<string>()
  return list.filter((p) => {
    const key = p.recipes
      .map((r) => r.recipeId)
      .sort()
      .join()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** 出した案として覚える形（料理と食数） */
export const shownOf = (p: Pick<ProposalView, 'recipes'>) =>
  p.recipes.map((r) => ({ recipeId: r.recipeId, servings: r.servings }))

const isShown = (v: unknown) =>
  Array.isArray(v) &&
  (v.every((id) => typeof id === 'string') ||
    v.every(
      (e) =>
        typeof e === 'object' &&
        e !== null &&
        typeof (e as Record<string, unknown>).recipeId === 'string' &&
        typeof (e as Record<string, unknown>).servings === 'number',
    ))

/** 食べたい料理と食数のキー。並びによらない */
export function anchorsKey(plan: Plan): string {
  return plan.recipes
    .filter((r) => r.role === 'anchor')
    .map((r) => `${r.recipeId}:${r.servings}`)
    .sort()
    .join(',')
}

export const firstRound = (anchors: string): ProposalRounds => ({ anchors, round: 1, shown: [] })

export const isProposalRounds = (v: unknown): v is ProposalRounds => {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  return (
    typeof r.anchors === 'string' &&
    typeof r.round === 'number' &&
    Number.isInteger(r.round) &&
    r.round >= 1 &&
    Array.isArray(r.shown) &&
    r.shown.every(isShown)
  )
}

/** 覚えている回が今の食べたい料理のものでなければ 1 回目 */
export function currentRounds(saved: ProposalRounds, anchors: string): ProposalRounds {
  return saved.anchors === anchors ? saved : firstRound(anchors)
}

/** 今出ている案を出した案に足して、次の回へ */
export function nextRound(rounds: ProposalRounds, current: ExcludedProposal[]): ProposalRounds {
  return { ...rounds, round: rounds.round + 1, shown: [...rounds.shown, ...current] }
}

export const roundsStorageKey = (planId: string) => `plan-proposals:${planId}`

/**
 * 提案カードで変えた食分（料理ごと。同じ料理が入っている案には同じ食分を出す）。
 * 献立には保存せず、案を選んだときにこの食分で保存する。食べたい料理が変わったら捨てる
 */
export type ProposalServings = { anchors: string; servings: Record<string, number> }

export const noServings = (anchors: string): ProposalServings => ({ anchors, servings: {} })

export const isProposalServings = (v: unknown): v is ProposalServings => {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  return (
    typeof r.anchors === 'string' &&
    typeof r.servings === 'object' &&
    r.servings !== null &&
    !Array.isArray(r.servings) &&
    Object.values(r.servings).every((n) => typeof n === 'number' && n > 0 && n <= MAX_SERVINGS_PER_DISH)
  )
}

export const servingsStorageKey = (planId: string) => `plan-servings:${planId}`

/** 鍵で固定した料理と食数（形は食分と同じ）。食べたい料理が変わったら捨てる */
export const locksStorageKey = (planId: string) => `plan-locks:${planId}`

/** 固定のキー。固定を変えたら「別の案を出す」の回を 1 回目に戻すのに使う */
export function locksKey(locked: Record<string, number>): string {
  return Object.entries(locked)
    .map(([id, sv]) => `${id}:${sv}`)
    .sort()
    .join(',')
}

/**
 * 提案カードの ＋－: SERVINGS_STEP の倍数に合わせて動かす。上限は MAX_SERVINGS_PER_DISH、下限は SERVINGS_STEP
 * （刻み 2 なら 1 → 2 → 4、4 → 2。刻み 1 なら 1 ずつ）
 */
export function stepUp(v: number, step = SERVINGS_STEP, max = MAX_SERVINGS_PER_DISH): number {
  return Math.min(max, (Math.floor(v / step) + 1) * step)
}
export function stepDown(v: number, step = SERVINGS_STEP): number {
  return Math.max(step, (Math.ceil(v / step) - 1) * step)
}
export const canStepUp = (v: number, max = MAX_SERVINGS_PER_DISH) => v < max

/** 合計◯食の ＋－（刻みの倍数で、刻みから MAX_TARGET_MEALS まで） */
export const mealsUp = (v: number) => stepUp(v, SERVINGS_STEP, MAX_TARGET_MEALS)
export const mealsDown = (v: number) => stepDown(v, SERVINGS_STEP)
export const canMealsUp = (v: number) => canStepUp(v, MAX_TARGET_MEALS)
export const canStepDown = (v: number, step = SERVINGS_STEP) => v > step
