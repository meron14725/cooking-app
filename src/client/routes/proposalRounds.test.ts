import { describe, expect, it } from 'vitest'
import { canStepDown, canStepUp, stepDown, stepUp } from './proposalRounds'

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
