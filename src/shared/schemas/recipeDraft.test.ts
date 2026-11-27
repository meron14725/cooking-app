import { describe, expect, it } from 'vitest'
import { splitUrl } from './recipeDraft'

describe('splitUrl', () => {
  it('最初の URL と残りの文に分ける', () => {
    expect(splitUrl('https://example.com/a?b=1')).toEqual({ url: 'https://example.com/a?b=1', memo: '' })
    expect(splitUrl('これ https://example.com/a 多めで')).toEqual({ url: 'https://example.com/a', memo: 'これ 多めで' })
    expect(splitUrl('「https://example.com/a」')).toEqual({ url: 'https://example.com/a', memo: '「 」' })
  })

  it('URL のすぐ後ろの日本語や句読点は URL に含めない', () => {
    expect(splitUrl('https://example.com/aを2人分で')).toEqual({ url: 'https://example.com/a', memo: 'を2人分で' })
    expect(splitUrl('https://example.com/a、玉ねぎ多め')).toEqual({
      url: 'https://example.com/a',
      memo: '、玉ねぎ多め',
    })
    expect(splitUrl('これ https://example.com/a. です')).toEqual({ url: 'https://example.com/a', memo: 'これ . です' })
  })

  it('URL があっても複数行のメモの改行は残す', () => {
    expect(splitUrl('https://example.com/a\n玉ねぎ  1個\n\n  にんじん 1本 ')).toEqual({
      url: 'https://example.com/a',
      memo: '玉ねぎ 1個\nにんじん 1本',
    })
  })

  it('URL がなければ文だけ', () => {
    expect(splitUrl('  鶏ももとキャベツで何か ')).toEqual({ url: null, memo: '鶏ももとキャベツで何か' })
  })
})
