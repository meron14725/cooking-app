import { describe, expect, it } from 'vitest'
import { MAX_SOURCE_URLS, validSourceUrls } from './sources'

describe('validSourceUrls', () => {
  it('http(s) の URL だけを重ねずに残す', () => {
    expect(
      validSourceUrls([
        'https://www.maff.go.jp/a',
        ' https://www.maff.go.jp/a ',
        'ftp://example.com/x',
        'javascript:alert(1)',
        'ただの文',
        42,
        'http://example.com/b',
      ]),
    ).toEqual(['https://www.maff.go.jp/a', 'http://example.com/b'])
  })

  it('サイトのトップページと画像の URL は根拠にならないので捨てる', () => {
    expect(
      validSourceUrls([
        'https://netsuper.aeon.com/',
        'https://example.com',
        'https://example.com/uploads/tofu.jpg',
        'https://example.com/a.PNG?v=1',
        'https://sm.rakuten.co.jp/search?categoryId=200049',
        'https://example.com/products/214/',
      ]),
    ).toEqual(['https://sm.rakuten.co.jp/search?categoryId=200049', 'https://example.com/products/214/'])
  })

  it(`${MAX_SOURCE_URLS} 件まで。長すぎる URL は捨てる。配列でなければ空`, () => {
    const many = Array.from({ length: 5 }, (_, i) => `https://example.com/${i}`)
    expect(validSourceUrls(many)).toHaveLength(MAX_SOURCE_URLS)
    expect(validSourceUrls([`https://example.com/${'x'.repeat(600)}`])).toEqual([])
    expect(validSourceUrls(undefined)).toEqual([])
    expect(validSourceUrls('https://example.com')).toEqual([])
  })
})
