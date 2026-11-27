import { describe, expect, it } from 'vitest'
import { cocoroSourceText, parseCocoroUrl, toOfficialMenuNo } from './cocoro'

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
