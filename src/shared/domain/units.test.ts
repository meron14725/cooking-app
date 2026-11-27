import { describe, expect, it } from 'vitest'
import { normalizeUnit, toBaseQuantity, toGrams } from './units'

const onion = { name: '玉ねぎ', unit: '個', gramsPerUnit: 200 }
const carrot = { name: 'にんじん', unit: '本', gramsPerUnit: 150 }
const pork = { name: '豚こま切れ肉', unit: 'g', gramsPerUnit: null }
const soy = { name: 'しょうゆ', unit: 'ml', gramsPerUnit: null }
const egg = { name: '卵', unit: '個', gramsPerUnit: null }

describe('normalizeUnit', () => {
  it('全角や表記ゆれをそろえる', () => {
    expect(normalizeUnit('ｇ')).toBe('g')
    expect(normalizeUnit('グラム')).toBe('g')
    expect(normalizeUnit('CC')).toBe('ml')
    expect(normalizeUnit('ｍｌ')).toBe('ml')
    expect(normalizeUnit('大匙')).toBe('大さじ')
    expect(normalizeUnit(' 個 ')).toBe('個')
  })
})

describe('toBaseQuantity', () => {
  it('基準単位と同じならそのまま', () => {
    expect(toBaseQuantity({ quantity: 0.5, unit: '個' }, onion)).toEqual({ quantity: 0.5, warning: null })
  })

  it('g は grams_per_unit で基準単位に直す', () => {
    expect(toBaseQuantity({ quantity: 150, unit: 'g' }, onion)).toEqual({ quantity: 0.75, warning: null })
    expect(toBaseQuantity({ quantity: 100, unit: 'g' }, carrot)).toEqual({ quantity: 0.67, warning: null })
  })

  it('kg も g として扱う', () => {
    expect(toBaseQuantity({ quantity: 0.3, unit: 'kg' }, pork)).toEqual({ quantity: 300, warning: null })
    expect(toBaseQuantity({ quantity: 1, unit: 'kg' }, onion)).toEqual({ quantity: 5, warning: null })
  })

  it('ml の食材は大さじ・小さじ・カップを ml に直す', () => {
    expect(toBaseQuantity({ quantity: 2, unit: '大さじ' }, soy)).toEqual({ quantity: 30, warning: null })
    expect(toBaseQuantity({ quantity: 1, unit: '小さじ' }, soy)).toEqual({ quantity: 5, warning: null })
    expect(toBaseQuantity({ quantity: 0.5, unit: 'カップ' }, soy)).toEqual({ quantity: 100, warning: null })
  })

  it('直せないときは null と警告', () => {
    const noWeight = toBaseQuantity({ quantity: 120, unit: 'g' }, egg)
    expect(noWeight.quantity).toBeNull()
    expect(noWeight.warning).toContain('卵')
    expect(toBaseQuantity({ quantity: 1, unit: '大さじ' }, pork).quantity).toBeNull()
    expect(toBaseQuantity({ quantity: 1, unit: '房' }, onion).quantity).toBeNull()
  })
})

describe('toGrams', () => {
  it('基準単位から g に戻す', () => {
    expect(toGrams(0.5, onion)).toBe(100)
    expect(toGrams(200, pork)).toBe(200)
    expect(toGrams(1, egg)).toBeNull()
  })
})
