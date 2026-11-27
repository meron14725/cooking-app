import type { Plan } from '../../shared/schemas/plan'

/**
 * 「別の案を出す」で、これまでに出した案（案ごとのレシピ ID）と何回目か。
 * 食べたい料理（anchor）と食数が変わったら、出した案は意味がなくなるので 1 回目に戻す
 */
export type ProposalRounds = { anchors: string; round: number; shown: string[][] }

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
    r.shown.every((ids) => Array.isArray(ids) && ids.every((id) => typeof id === 'string'))
  )
}

/** 覚えている回が今の食べたい料理のものでなければ 1 回目 */
export function currentRounds(saved: ProposalRounds, anchors: string): ProposalRounds {
  return saved.anchors === anchors ? saved : firstRound(anchors)
}

/** 今出ている案を出した案に足して、次の回へ */
export function nextRound(rounds: ProposalRounds, current: string[][]): ProposalRounds {
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
    Object.values(r.servings).every((n) => typeof n === 'number' && n > 0 && n <= MAX_SERVINGS)
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

/** 食数の上限（API の食数の制約と同じ） */
export const MAX_SERVINGS = 20
