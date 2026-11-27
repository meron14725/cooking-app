import { describe, expect, it } from 'vitest'
import { categoryByName, fixIngredientByRule } from './ingredientAttributes'

describe('categoryByName', () => {
  it.each([
    ['玉ねぎ', 'vegetable'],
    ['しめじ', 'vegetable'],
    ['トマト', 'vegetable'],
    ['さば（切り身）', 'fish'],
    ['塩さば', 'fish'],
    ['むきえび', 'fish'],
    ['たらこ', 'fish'],
    ['豚こま切れ肉', 'meat'],
    ['ベーコン', 'meat'],
    ['油揚げ', 'tofu_egg_dairy'],
    ['卵', 'tofu_egg_dairy'],
    ['砂糖', 'seasoning'],
    ['トマトケチャップ', 'seasoning'],
    ['ごま油', 'seasoning'],
    ['バニラエッセンス', 'seasoning'],
    ['鶏がらスープの素', 'seasoning'],
    ['かつおぶし', 'dry'],
    ['いりごま', 'dry'],
    ['りんご', 'other'],
    ['すいか', 'other'],
    ['アーモンド', 'other'],
    ['水', 'other'],
    ['水菜', 'vegetable'],
    ['カレールウ', 'other'],
    ['謎の食材', null],
  ])('%s → %s', (name, category) => {
    expect(categoryByName(name)).toBe(category)
  })
})

describe('fixIngredientByRule', () => {
  it('vegetable だけ名前で直す。ほかの分類は登録したときのまま', () => {
    expect(fixIngredientByRule({ name: '砂糖', category: 'vegetable', unit: 'g', gramsPerUnit: null })).toEqual({
      category: 'seasoning',
      gramsPerUnit: null,
      needsAi: false,
    })
    expect(fixIngredientByRule({ name: '砂糖', category: 'other', unit: 'g', gramsPerUnit: null }).category).toBe(
      'other',
    )
  })

  it('名前で決まらない vegetable と、g・ml 以外で重さがないものは AI に回す', () => {
    expect(fixIngredientByRule({ name: '謎', category: 'vegetable', unit: 'g', gramsPerUnit: null }).needsAi).toBe(true)
    expect(fixIngredientByRule({ name: '卵', category: 'vegetable', unit: '個', gramsPerUnit: null })).toEqual({
      category: 'tofu_egg_dairy',
      gramsPerUnit: null,
      needsAi: true,
    })
    expect(
      fixIngredientByRule({ name: '牛乳', category: 'tofu_egg_dairy', unit: 'ml', gramsPerUnit: null }).needsAi,
    ).toBe(false)
  })
})
