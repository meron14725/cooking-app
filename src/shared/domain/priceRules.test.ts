import { describe, expect, it } from 'vitest'
import { type PriceRuleInput, priceByRule } from './priceRules'

const ing = (over: Partial<PriceRuleInput>): PriceRuleInput => ({
  name: '',
  aliases: [],
  unit: 'g',
  gramsPerUnit: null,
  packageUnits: [],
  ...over,
})

describe('priceByRule', () => {
  it('g の食材は代表量（なければ 100g）あたりで出す', () => {
    expect(priceByRule(ing({ name: '豚こま切れ肉' }))).toBe(150)
    expect(priceByRule(ing({ name: '豚こま切れ肉', packageUnits: [{ quantity: 300, isDefault: true }] }))).toBe(450)
  })

  it('上から順に見る（豚ひき肉は豚肉より先、高野豆腐は豆腐にしない）', () => {
    expect(priceByRule(ing({ name: '豚ひき肉' }))).toBe(150)
    expect(priceByRule(ing({ name: '豚肉' }))).toBe(170)
    expect(priceByRule(ing({ name: '高野豆腐', unit: '丁' }))).toBeNull()
    expect(priceByRule(ing({ name: '木綿豆腐', unit: '丁' }))).toBe(80)
  })

  it('個の食材は代表の販売単位の量をかける', () => {
    expect(priceByRule(ing({ name: '玉ねぎ', unit: '個', packageUnits: [{ quantity: 3, isDefault: true }] }))).toBe(150)
  })

  it('別名でも当たる。全角・半角は揃える', () => {
    expect(priceByRule(ing({ name: 'オニオン', aliases: ['たまねぎ'], unit: '個' }))).toBe(50)
    expect(priceByRule(ing({ name: 'ﾍﾞｰｺﾝ' }))).toBe(300)
  })

  it('辞書が g で食材が個なら grams_per_unit で直す。直せなければ null', () => {
    // かぼちゃ 100g 50 円、1 個 1200g
    expect(priceByRule(ing({ name: 'かぼちゃ', unit: '個', gramsPerUnit: 1200 }))).toBe(600)
    expect(priceByRule(ing({ name: 'かぼちゃ', unit: '個' }))).toBeNull()
    // 辞書が個で食材が g は直さない
    expect(priceByRule(ing({ name: '玉ねぎ', unit: 'g' }))).toBeNull()
  })

  it('辞書にない食材は null', () => {
    expect(priceByRule(ing({ name: '謎の食材' }))).toBeNull()
  })

  it('米は名前がちょうどのときだけ', () => {
    expect(priceByRule(ing({ name: '米', packageUnits: [{ quantity: 5000, isDefault: true }] }))).toBe(3000)
    expect(priceByRule(ing({ name: '米粉' }))).toBeNull()
  })
})
