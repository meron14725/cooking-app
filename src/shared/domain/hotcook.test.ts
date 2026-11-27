import { describe, expect, it } from 'vitest'
import { splitHotcookMode } from './hotcook'

describe('splitHotcookMode', () => {
  it('加熱時間とそれ以外に分ける。「手動」は省く', () => {
    expect(splitHotcookMode('手動 > 煮物を作る > まぜる > 10分')).toEqual({
      minutes: 10,
      label: '煮物を作る ・ まぜる',
    })
    expect(splitHotcookMode('煮物 ＞ まぜない ＞ 約２５分')).toEqual({ minutes: 25, label: '煮物 ・ まぜない' })
  })

  it('時間がなければ minutes は null', () => {
    expect(splitHotcookMode('自動 > 肉じゃが')).toEqual({ minutes: null, label: '自動 ・ 肉じゃが' })
    expect(splitHotcookMode(null)).toEqual({ minutes: null, label: '' })
  })
})
