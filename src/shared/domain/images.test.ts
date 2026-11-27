import { describe, expect, it } from 'vitest'
import { imagePath, isImageKey } from './images'

describe('isImageKey', () => {
  it('img/ の直下のファイル名だけを許す', () => {
    expect(isImageKey('img/R4063.jpg')).toBe(true)
    expect(isImageKey('img/a_b-1.webp')).toBe(true)
    expect(isImageKey('R4063.jpg')).toBe(false)
    expect(isImageKey('other/R4063.jpg')).toBe(false)
    expect(isImageKey('img/../secret')).toBe(false)
    expect(isImageKey('img/..')).toBe(false)
    expect(isImageKey('img/a/b.jpg')).toBe(false)
    expect(isImageKey('img/.hidden')).toBe(false)
    expect(isImageKey('img/')).toBe(false)
  })

  it('URL は /api/images/ の下', () => {
    expect(imagePath('img/R4063.jpg')).toBe('/api/images/img/R4063.jpg')
  })
})
