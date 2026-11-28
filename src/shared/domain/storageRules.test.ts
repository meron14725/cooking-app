import { describe, expect, it } from 'vitest'
import { storageByRule, validStorage } from './storageRules'

const rule = (name: string, category: Parameters<typeof storageByRule>[0]['category'], aliases: string[] = []) =>
  storageByRule({ name, aliases, category })

describe('storageByRule', () => {
  it('グラニュー糖は常温で長く持つ。かつおぶしは常温の乾物', () => {
    expect(rule('グラニュー糖', 'seasoning')).toMatchObject({
      defaultLocation: 'pantry',
      canFreeze: false,
      freezerDays: null,
    })
    expect(rule('グラニュー糖', 'seasoning')?.pantryDays).toBeGreaterThanOrEqual(365)
    expect(rule('かつおぶし', 'dry')).toMatchObject({ defaultLocation: 'pantry', pantryDays: 180, canFreeze: false })
  })

  it('分類が合わない行は使わない（塩さばは魚の行、調味料の「塩」にしない）', () => {
    expect(rule('塩さば', 'fish')).toMatchObject({ defaultLocation: 'fridge', fridgeDays: 2, freezerDays: 30 })
  })

  it('別名でも当たる。冷凍できないものは冷凍の日数が null', () => {
    expect(rule('とうふ（木綿）', 'tofu_egg_dairy', ['木綿豆腐'])).toMatchObject({
      canFreeze: false,
      freezerDays: null,
    })
  })

  it('名前で決まらない野菜・そのほかは null（AI に回す）', () => {
    expect(rule('ロマネスコ', 'vegetable')).toBeNull()
    expect(rule('りんご', 'other')).toBeNull()
  })
})

describe('validStorage（AI の答えを確かめる）', () => {
  const ok = {
    canFreeze: true,
    fridgeDays: 5,
    freezerDays: 30,
    pantryDays: null,
    defaultLocation: 'fridge',
    preppedFridgeDays: 2,
    preppedFreezerDays: 14,
  }

  it('範囲内なら通す', () => {
    expect(validStorage(ok)).toEqual(ok)
  })

  it('冷凍できないなら冷凍の日数は null にする', () => {
    expect(validStorage({ ...ok, canFreeze: false })).toMatchObject({ freezerDays: null, preppedFreezerDays: null })
  })

  it('0〜365 の整数でない日数、冷蔵の日数なし、矛盾した保存場所は捨てる', () => {
    expect(validStorage({ ...ok, fridgeDays: 366 })).toBeNull()
    expect(validStorage({ ...ok, freezerDays: -1 })).toBeNull()
    expect(validStorage({ ...ok, fridgeDays: 2.5 })).toBeNull()
    expect(validStorage({ ...ok, fridgeDays: null })).toBeNull()
    expect(validStorage({ ...ok, canFreeze: false, defaultLocation: 'freezer' })).toBeNull()
    expect(validStorage({ ...ok, defaultLocation: 'pantry', pantryDays: null })).toBeNull()
    expect(validStorage({ ...ok, canFreeze: true, freezerDays: null })).toBeNull()
    expect(validStorage({ ...ok, defaultLocation: 'kitchen' })).toBeNull()
    expect(validStorage(null)).toBeNull()
  })
})
