import { describe, expect, it } from 'vitest'
import { splitUrl } from './recipeDraft'

describe('splitUrl', () => {
  it('最初の URL と残りの文に分ける', () => {
    expect(splitUrl('https://example.com/a?b=1')).toEqual({ url: 'https://example.com/a?b=1', memo: '' })
    expect(splitUrl('これ https://example.com/a 多めで')).toEqual({ url: 'https://example.com/a', memo: 'これ 多めで' })
    expect(splitUrl('「https://example.com/a」')).toEqual({ url: 'https://example.com/a', memo: '「 」' })
  })

  it('URL がなければ文だけ', () => {
    expect(splitUrl('  鶏ももとキャベツで何か ')).toEqual({ url: null, memo: '鶏ももとキャベツで何か' })
  })
})
