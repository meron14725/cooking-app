import { describe, expect, it } from 'vitest'
import {
  canMealsUp,
  canStepDown,
  canStepUp,
  isProposalRounds,
  mealsDown,
  mealsUp,
  proposalKey,
  shownOf,
  stepDown,
  stepUp,
  uniqueByRecipes,
} from './proposalRounds'

describe('提案カードの ＋－ の刻み', () => {
  it('刻み 2・上限 4: 倍数に合わせて動き、2 より下げない', () => {
    expect([1, 2, 3, 4].map((v) => stepUp(v, 2, 4))).toEqual([2, 4, 4, 4])
    expect([1, 2, 3, 4].map((v) => stepDown(v, 2))).toEqual([2, 2, 2, 2])
    expect([1, 2, 3, 4].map((v) => canStepDown(v, 2))).toEqual([false, false, true, true])
    expect([1, 2, 3, 4].map((v) => canStepUp(v, 4))).toEqual([true, true, true, false])
  })

  it('刻み 1 なら 1 ずつ', () => {
    expect(stepUp(1, 1, 4)).toBe(2)
    expect(stepDown(3, 1)).toBe(2)
    expect(canStepDown(1, 1)).toBe(false)
  })
})

describe('proposalRounds', () => {
  const p = {
    recipes: [
      { recipeId: 'a', servings: 4 },
      { recipeId: 'b', servings: 2 },
    ],
  } as Parameters<typeof proposalKey>[0]

  it('案のキーは料理と食数。食数だけ違う案は別のキーになる', () => {
    const other = { recipes: p.recipes.map((r) => ({ ...r, servings: r.recipeId === 'a' ? 2 : 4 })) } as typeof p
    expect(proposalKey(p)).not.toBe(proposalKey(other))
    expect(shownOf(p)).toEqual([
      { recipeId: 'a', servings: 4 },
      { recipeId: 'b', servings: 2 },
    ])
  })

  it('覚えた回は、食数付きの新しい形も ID だけの古い形も読める', () => {
    expect(isProposalRounds({ anchors: 'x', round: 2, shown: [shownOf(p)] })).toBe(true)
    expect(isProposalRounds({ anchors: 'x', round: 2, shown: [['a', 'b']] })).toBe(true)
    expect(isProposalRounds({ anchors: 'x', round: 2, shown: [[{ recipeId: 'a' }]] })).toBe(false)
  })

  it('合計◯食は 2 食ずつ、2〜16 食', () => {
    expect(mealsUp(6)).toBe(8)
    expect(mealsDown(6)).toBe(4)
    expect(mealsDown(2)).toBe(2)
    expect(mealsUp(16)).toBe(16)
    expect(canMealsUp(16)).toBe(false)
  })
})

describe('uniqueByRecipes', () => {
  it('同じ料理の組み合わせで食数だけ違う案は、先のほうだけ残す', () => {
    const p = (a: number, b: number, extra?: string) => ({
      recipes: [
        { recipeId: 'curry', servings: a },
        { recipeId: extra ?? 'salad', servings: b },
      ],
    })
    const list = [p(4, 2), p(2, 4), p(2, 4, 'soup')] as Parameters<typeof uniqueByRecipes>[0]
    expect(uniqueByRecipes(list)).toEqual([list[0], list[2]])
  })
})
