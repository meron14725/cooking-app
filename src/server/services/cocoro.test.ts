import { describe, expect, it } from 'vitest'
import {
  cocoroHotcookMode,
  cocoroSourceText,
  parseAmountText,
  parseCalorie,
  parseCocoroUrl,
  parseServings,
  toOfficialMenuNo,
} from './cocoro'

describe('parseCocoroUrl', () => {
  it('機種とレシピコードを取り出す。機種がなければ KN-HW16G', () => {
    expect(parseCocoroUrl(new URL('https://cocoroplus.jp.sharp/kitchen/recipe/hotcook/KN-HW16G/R4063'))).toEqual({
      model: 'KN-HW16G',
      code: 'R4063',
    })
    expect(parseCocoroUrl(new URL('https://cocoroplus.jp.sharp/kitchen/recipe/hotcook/R4063/'))).toEqual({
      model: 'KN-HW16G',
      code: 'R4063',
    })
  })

  it('ほかのホストやパスは null', () => {
    expect(parseCocoroUrl(new URL('https://example.com/kitchen/recipe/hotcook/KN-HW16G/R4063'))).toBeNull()
    expect(parseCocoroUrl(new URL('https://cocoroplus.jp.sharp/kitchen/recipe/healsio/AX-1/R4063'))).toBeNull()
    expect(parseCocoroUrl(new URL('https://cocoroplus.jp.sharp/kitchen/recipe/hotcook/KN-HW16G/R4063/x'))).toBeNull()
  })
})

describe('toOfficialMenuNo', () => {
  it('3 桁にそろえる', () => {
    expect(toOfficialMenuNo('0063')).toBe('063')
    expect(toOfficialMenuNo('63')).toBe('063')
    expect(toOfficialMenuNo(7)).toBe('007')
    expect(toOfficialMenuNo('123')).toBe('123')
  })

  it('番号でなければ null', () => {
    expect(toOfficialMenuNo('')).toBeNull()
    expect(toOfficialMenuNo(null)).toBeNull()
    expect(toOfficialMenuNo('0')).toBeNull()
    expect(toOfficialMenuNo('abc')).toBeNull()
    expect(toOfficialMenuNo('1000')).toBeNull()
  })
})

describe('cocoroSourceText', () => {
  it('タイトル・材料・作り方の行にする（HTML のタグは外す）', () => {
    const text = cocoroSourceText({
      name: '架空の煮物',
      quantity: '2人分',
      materials: [
        { name: 'にんじん', quantity: '1本', group: null },
        { name: 'しょうゆ', quantity: '大さじ1', group: 'A' },
      ],
      methods: [{ text: null, renderedHtml: '<p>材料を<b>入れる</b></p>' }],
    })
    expect(text.split('\n')).toEqual([
      'タイトル: 架空の煮物',
      '分量: 2人分',
      '材料:',
      '- にんじん 1本',
      '- A しょうゆ 大さじ1',
      '作り方:',
      '1. 材料を 入れる',
    ])
  })
})

describe('parseAmountText', () => {
  it('数と単位に分ける', () => {
    expect(parseAmountText('300 g')).toEqual({ quantity: 300, unit: 'g' })
    expect(parseAmountText('1/2個')).toEqual({ quantity: 0.5, unit: '個' })
    expect(parseAmountText('大さじ1と1/2')).toEqual({ quantity: 1.5, unit: '大さじ' })
    expect(parseAmountText('小さじ１/２')).toEqual({ quantity: 0.5, unit: '小さじ' })
    expect(parseAmountText('2切れ')).toEqual({ quantity: 2, unit: '切れ' })
    expect(parseAmountText('1片（10g）')).toEqual({ quantity: 1, unit: '片' })
  })

  it('「2〜3個」のような範囲は少ないほうの量と単位', () => {
    expect(parseAmountText('2〜3個')).toEqual({ quantity: 2, unit: '個' })
    expect(parseAmountText('1/2～1本')).toEqual({ quantity: 0.5, unit: '本' })
    expect(parseAmountText('100~150g')).toEqual({ quantity: 100, unit: 'g' })
    expect(parseAmountText('大さじ1〜2')).toEqual({ quantity: 1, unit: '大さじ' })
  })

  it('少々・適量や読めない表記は null', () => {
    expect(parseAmountText('少々')).toEqual({ quantity: null, unit: null })
    expect(parseAmountText('適量')).toEqual({ quantity: null, unit: null })
    expect(parseAmountText('')).toEqual({ quantity: null, unit: null })
    expect(parseAmountText('お好みで')).toEqual({ quantity: null, unit: null })
  })
})

describe('parseServings / parseCalorie', () => {
  it('人数は最初の数。読めなければ null', () => {
    expect(parseServings('2人分')).toBe(2)
    expect(parseServings('２〜４人分')).toBe(2)
    expect(parseServings('')).toBeNull()
  })

  it('カロリーは kcal の前の数。「全量」なら人数で割る', () => {
    expect(parseCalorie('310kcal', 2)).toBe(310)
    expect(parseCalorie('1人分 約310kcal', 2)).toBe(310)
    expect(parseCalorie('全量 620kcal', 2)).toBe(310)
    expect(parseCalorie('', 2)).toBeNull()
  })
})

describe('cocoroHotcookMode', () => {
  it('メニュー番号があれば「メニュー番号で探す → No.063」', () => {
    expect(cocoroHotcookMode({ name: 'x', menuNum: '0063' } as never)).toBe('メニュー番号で探す → No.063')
    expect(cocoroHotcookMode({ name: 'x', menuNum: null } as never)).toBeNull()
  })
})
