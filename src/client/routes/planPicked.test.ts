import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dropMissing, isPickedList, loadPicked, savePicked } from './planPicked'

function fakeStorage() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  }
}

beforeEach(() => vi.stubGlobal('sessionStorage', fakeStorage()))
afterEach(() => vi.unstubAllGlobals())

describe('planPicked', () => {
  const a = { recipeId: 'a', title: 'A', servings: 1 }
  const b = { recipeId: 'b', title: 'B', servings: 2 }

  it('保存した選択を読める。空にすると消える', () => {
    savePicked([a, b])
    expect(loadPicked()).toEqual([a, b])
    savePicked([])
    expect(loadPicked()).toEqual([])
  })

  it('中身の形が違う選択は読まない（古い形・壊れた値）', () => {
    expect(isPickedList([{ recipeId: 'a', title: 'A' }])).toBe(false)
    expect(isPickedList([{ recipeId: 'a', title: 'A', servings: 0 }])).toBe(false)
    expect(isPickedList([{ recipeId: 1, title: 'A', servings: 1 }])).toBe(false)
    expect(isPickedList(['a'])).toBe(false)
    sessionStorage.setItem('plan-picked', JSON.stringify([{ id: 'a' }]))
    expect(loadPicked()).toEqual([])
  })

  it('今あるレシピに無い ID は外す。変わらなければ同じ配列', () => {
    expect(dropMissing([a, b], new Set(['b']))).toEqual([b])
    const same = [a, b]
    expect(dropMissing(same, new Set(['a', 'b']))).toBe(same)
  })
})
