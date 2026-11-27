import { describe, expect, it } from 'vitest'
import type { Ingredient } from '../../shared/schemas/ingredient'
import type { RecipeDraftRaw } from '../../shared/schemas/recipeDraft'
import {
  assertPublicUrl,
  buildSourceText,
  decodeHtml,
  extractJsonLdRecipe,
  htmlToText,
  normalizeDraft,
} from './recipeImport'

const master = (m: Partial<Ingredient> & Pick<Ingredient, 'id' | 'name' | 'unit'>): Ingredient => ({
  aliases: [],
  category: 'vegetable',
  gramsPerUnit: null,
  canFreeze: true,
  fridgeDays: 3,
  freezerDays: null,
  pantryDays: null,
  preppedFridgeDays: null,
  preppedFreezerDays: null,
  defaultLocation: 'fridge',
  beforeCookTask: null,
  frozenCookNote: null,
  isStaple: false,
  packageUnits: [],
  ...m,
})

const onion = master({ id: 'onion', name: '玉ねぎ', unit: '個', gramsPerUnit: 200, aliases: ['たまねぎ'] })
const salmon = master({ id: 'salmon', name: '鮭（切り身）', unit: '切れ', category: 'fish' })
const soy = master({ id: 'soy', name: 'しょうゆ', unit: 'ml', category: 'seasoning' })
const egg = master({ id: 'egg', name: '卵', unit: '個', category: 'tofu_egg_dairy' })

describe('assertPublicUrl', () => {
  it('http(s) の公開ホストは通す', () => {
    expect(assertPublicUrl('https://example.com/recipe/1').hostname).toBe('example.com')
  })
  it('ローカルやプライベートなアドレス、http(s) 以外は 400', () => {
    for (const url of [
      'http://localhost:8787/',
      'http://127.0.0.1/',
      'http://192.168.1.10/',
      'http://10.0.0.1/',
      'http://172.20.0.1/',
      'http://[::1]/',
      'file:///etc/passwd',
      'ftp://example.com/',
      'not a url',
    ]) {
      expect(() => assertPublicUrl(url), url).toThrow()
    }
  })
})

describe('extractJsonLdRecipe', () => {
  it('@graph の中の Recipe を読み、HowToSection の手順も平らにする', () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebPage', name: 'ページ' },
        {
          '@type': ['Recipe'],
          name: '肉じゃが &amp; みそ汁',
          recipeYield: ['2人分'],
          recipeIngredient: ['じゃがいも 2個', '玉ねぎ 1/2個'],
          recipeInstructions: [
            { '@type': 'HowToSection', itemListElement: [{ '@type': 'HowToStep', text: '切る' }] },
            { '@type': 'HowToStep', text: '煮る' },
            '盛る',
          ],
        },
      ],
    })}</script></head></html>`
    expect(extractJsonLdRecipe(html)).toEqual({
      name: '肉じゃが & みそ汁',
      recipeYield: '2人分',
      ingredients: ['じゃがいも 2個', '玉ねぎ 1/2個'],
      instructions: ['切る', '煮る', '盛る'],
    })
  })

  it('壊れた JSON や Recipe がなければ null', () => {
    expect(extractJsonLdRecipe('<script type="application/ld+json">{broken</script>')).toBeNull()
    expect(extractJsonLdRecipe('<p>レシピ</p>')).toBeNull()
  })
})

describe('本文の取り出し', () => {
  it('script や style を除き、行を保つ', () => {
    const html =
      '<title>カレー | サイト</title><style>p{}</style><script>alert(1)</script><h1>カレー</h1><p>材料&nbsp;2人分<br>玉ねぎ 1個</p>'
    expect(htmlToText(html)).toBe('カレー | サイト カレー\n材料 2人分\n玉ねぎ 1個')
  })

  it('構造化データがあればそれを、なければ本文を使う', () => {
    expect(buildSourceText('<title>T</title><p>本文</p>')).toEqual({ text: 'タイトル: T\nT 本文', structured: false })
    const ld = `<script type="application/ld+json">{"@type":"Recipe","name":"汁","recipeIngredient":["水 1カップ"]}</script>`
    expect(buildSourceText(ld)).toEqual({ text: 'タイトル: 汁\n材料:\n- 水 1カップ\n作り方:', structured: true })
  })

  it('meta の charset で Shift_JIS のページを読む', () => {
    // 「玉ねぎ」を Shift_JIS で
    const sjis = new Uint8Array([0x8b, 0xca, 0x82, 0xcb, 0x82, 0xac])
    const head = new TextEncoder().encode('<meta charset="Shift_JIS">')
    const bytes = new Uint8Array([...head, ...sjis])
    expect(decodeHtml(bytes, 'text/html')).toContain('玉ねぎ')
  })
})

describe('normalizeDraft', () => {
  const raw = (ingredients: RecipeDraftRaw['ingredients']): RecipeDraftRaw => ({
    title: 'テスト',
    servings: 2,
    caloriesKcal: null,
    hotcookMode: null,
    maxServings1_6l: null,
    ingredients,
    steps: [],
    warnings: [],
  })

  it('別名や括弧を外した名前で照合し、単位を基準単位に直す', () => {
    const draft = normalizeDraft(
      raw([
        { displayText: 'たまねぎ 150g', name: 'たまねぎ', quantity: 150, unit: 'g', cutStyle: '薄切り' },
        { displayText: '鮭 2切れ', name: '鮭', quantity: 2, unit: '切れ', cutStyle: null },
        { displayText: 'しょうゆ 大さじ2', name: 'しょうゆ', quantity: 2, unit: '大さじ', cutStyle: null },
        { displayText: 'しょうゆ 少々', name: 'しょうゆ', quantity: null, unit: null, cutStyle: null },
      ]),
      [onion, salmon, soy, egg],
      'https://example.com/r',
    )
    expect(draft.ingredients.map((i) => [i.ingredientId, i.quantity])).toEqual([
      ['onion', 0.75],
      ['salmon', 2],
      ['soy', 30],
      ['soy', null],
    ])
    expect(draft.warnings).toEqual([])
    expect(draft.sourceUrl).toBe('https://example.com/r')
  })

  it('換算できない量は null にして警告、マスタにない食材は候補名と単位を残す', () => {
    const draft = normalizeDraft(
      raw([
        { displayText: '卵 120g', name: '卵', quantity: 120, unit: 'g', cutStyle: null },
        { displayText: 'ぶり 2切れ', name: 'ぶり', quantity: 2, unit: '切れ', cutStyle: null },
      ]),
      [onion, egg],
      null,
    )
    expect(draft.ingredients[0]).toMatchObject({ ingredientId: 'egg', quantity: null })
    expect(draft.ingredients[1]).toMatchObject({
      ingredientId: null,
      suggestedName: 'ぶり',
      suggestedUnit: '切れ',
      quantity: 2,
    })
    expect(draft.warnings).toHaveLength(2)
    expect(draft.warnings[1]).toContain('ぶり')
  })
})
