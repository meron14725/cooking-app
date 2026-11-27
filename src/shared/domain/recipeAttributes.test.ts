import { describe, expect, it } from 'vitest'
import {
  type AttributeIngredient,
  cookMinutesFromHotcookMode,
  deriveAttributes,
  inferCuisine,
  inferDishType,
  mixingFromHotcookMode,
  parseCookMinutes,
  toGrams,
} from './recipeAttributes'

const ing = (name: string, category: string, quantity: number | null, unit = 'g', gramsPerUnit: number | null = null) =>
  ({ name, category, quantity, unit, gramsPerUnit, isStaple: false }) satisfies AttributeIngredient
const seasoning = (name: string) => ({ ...ing(name, 'seasoning', null), isStaple: true })

describe('toGrams', () => {
  it('g・ml はそのまま、個は 1 つの重さを掛ける。直せなければ null', () => {
    expect(toGrams(150, 'g', null)).toBe(150)
    expect(toGrams(200, 'ml', null)).toBe(200)
    expect(toGrams(2, '個', 200)).toBe(400)
    expect(toGrams(2, '個', null)).toBeNull()
    expect(toGrams(null, 'g', null)).toBeNull()
  })
})

describe('parseCookMinutes', () => {
  it.each([
    ['約30分', 30],
    ['30分', 30],
    ['1時間10分', 70],
    ['1時間', 60],
    ['30〜40分', 40],
    ['２５分', 25],
    ['', null],
    [null, null],
    ['すぐ', null],
    // 保存できる範囲（1〜600 分）の外は null
    ['0分', null],
    ['12時間', null],
  ])('%s → %s', (text, minutes) => {
    expect(parseCookMinutes(text)).toBe(minutes)
  })
})

describe('ホットクックの設定から', () => {
  it('まぜる / まぜない', () => {
    expect(mixingFromHotcookMode('手動 > 煮物を作る > まぜる > 25分')).toBe(true)
    expect(mixingFromHotcookMode('手動 > 煮物を作る > まぜない > 30分')).toBe(false)
    expect(mixingFromHotcookMode('メニュー番号で探す → No.063')).toBeNull()
    expect(mixingFromHotcookMode(null)).toBeNull()
  })

  it('調理時間 = 加熱時間 + 下ごしらえ 10 分', () => {
    expect(cookMinutesFromHotcookMode('手動 > 煮物を作る > まぜる > 25分')).toBe(35)
    expect(cookMinutesFromHotcookMode('メニュー番号で探す → No.063')).toBeNull()
    expect(cookMinutesFromHotcookMode('手動 > 煮物を作る > まぜない > 999分')).toBeNull()
  })
})

describe('inferDishType', () => {
  const base = { servings: 2, hotcookMode: null }
  it('名前のキーワード: おやつ → 汁物 → ご飯もの・麺（主菜）', () => {
    expect(inferDishType({ ...base, title: 'おしるこ', ingredients: [] })).toBe('other')
    expect(inferDishType({ ...base, title: '豚汁', ingredients: [] })).toBe('soup')
    expect(inferDishType({ ...base, title: 'かぼちゃのポタージュ', ingredients: [] })).toBe('soup')
    // ご飯もの・麺は 1 品で主菜を兼ねるので主菜（肉が少なくても）
    expect(inferDishType({ ...base, title: '鶏の炊き込みご飯', ingredients: [] })).toBe('main')
    expect(inferDishType({ ...base, title: 'チキンカレー', ingredients: [ing('鶏もも肉', 'meat', 50)] })).toBe('main')
    expect(inferDishType({ ...base, title: '親子丼', ingredients: [] })).toBe('main')
    // スープカレーは汁物
    expect(inferDishType({ ...base, title: 'スープカレー', ingredients: [] })).toBe('soup')
  })

  it('1 人前の肉・魚・大豆製品・卵が 60g 以上なら主菜、なければ副菜', () => {
    expect(
      inferDishType({
        ...base,
        title: '肉じゃが',
        ingredients: [ing('豚こま', 'meat', 200), ing('じゃがいも', 'vegetable', 300)],
      }),
    ).toBe('main')
    expect(
      inferDishType({
        ...base,
        title: 'ほうれん草のおひたし',
        ingredients: [ing('ほうれん草', 'vegetable', 200), ing('油揚げ', 'tofu_egg_dairy', 1, '枚', 30)],
      }),
    ).toBe('side')
  })

  it('牛乳・チーズは主菜の判定に数えない', () => {
    expect(
      inferDishType({
        ...base,
        title: 'かぶのクリーム煮',
        ingredients: [ing('かぶ', 'vegetable', 300), ing('牛乳', 'tofu_egg_dairy', 300, 'ml')],
      }),
    ).toBe('side')
  })

  it('常備品は数えず、量が 1 つも読めなければ null', () => {
    expect(
      inferDishType({
        ...base,
        title: '何か',
        ingredients: [seasoning('しょうゆ'), ing('卵', 'tofu_egg_dairy', 2, '個')],
      }),
    ).toBeNull()
  })
})

describe('inferCuisine', () => {
  it('名前と調味料から決める', () => {
    expect(inferCuisine({ title: '肉じゃが', ingredients: [seasoning('しょうゆ'), seasoning('みりん')] })).toBe(
      'japanese',
    )
    expect(inferCuisine({ title: 'ポークカレー', ingredients: [ing('カレールウ', 'other', 100)] })).toBe('western')
    expect(inferCuisine({ title: '麻婆豆腐', ingredients: [seasoning('豆板醤')] })).toBe('chinese')
    // 「中華だし」は和のだしに数えない
    expect(
      inferCuisine({ title: 'なすの炒め煮', ingredients: [seasoning('中華だし'), seasoning('オイスターソース')] }),
    ).toBe('chinese')
    expect(
      inferCuisine({
        title: 'グリーンカレー',
        ingredients: [seasoning('ナンプラー'), ing('ココナッツミルク', 'other', 200, 'ml')],
      }),
    ).toBe('ethnic')
  })

  it('はっきりしなければ null', () => {
    expect(inferCuisine({ title: '野菜の蒸し煮', ingredients: [ing('キャベツ', 'vegetable', 200)] })).toBeNull()
    // 和（しょうゆ）と洋（バター）が 1 点ずつ
    expect(inferCuisine({ title: 'きのこ炒め', ingredients: [seasoning('しょうゆ'), seasoning('バター')] })).toBeNull()
  })
})

describe('deriveAttributes', () => {
  it('取り込み元の値があればルールより優先し、null の欄はルールで埋める', () => {
    const input = {
      title: '豚汁',
      servings: 2,
      hotcookMode: '手動 > 煮物を作る > まぜる > 15分',
      ingredients: [ing('豚こま', 'meat', 100), seasoning('味噌')],
    }
    expect(deriveAttributes(input)).toEqual({
      dishType: 'soup',
      cuisine: 'japanese',
      usesMixingUnit: true,
      cookMinutes: 25,
    })
    expect(deriveAttributes(input, { usesMixingUnit: false, cookMinutes: 40, cuisine: null })).toEqual({
      dishType: 'soup',
      cuisine: 'japanese',
      usesMixingUnit: false,
      cookMinutes: 40,
    })
  })
})
