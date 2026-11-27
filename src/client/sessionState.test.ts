import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isRecordOf, isStringArray, readSession, writeSession } from './sessionState'

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

describe('sessionState', () => {
  const isLoc = isRecordOf(['fridge', 'freezer'] as const)

  it('書いた値を読める。null で消える', () => {
    writeSession('k', { a: 'freezer' })
    expect(readSession('k', isLoc)).toEqual({ a: 'freezer' })
    writeSession('k', null)
    expect(readSession('k', isLoc)).toBeNull()
  })

  it('形が違う値・壊れた値は null', () => {
    sessionStorage.setItem('k', JSON.stringify({ a: 'pantry' }))
    expect(readSession('k', isLoc)).toBeNull()
    sessionStorage.setItem('k', '{broken')
    expect(readSession('k', isLoc)).toBeNull()
    sessionStorage.setItem('s', JSON.stringify(['a', 1]))
    expect(readSession('s', isStringArray)).toBeNull()
  })

  it('sessionStorage が使えなくても投げない', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    })
    expect(() => writeSession('k', ['a'])).not.toThrow()
    expect(readSession('k', isStringArray)).toBeNull()
  })
})
