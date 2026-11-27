/**
 * レシピ写真の R2 オブジェクトキー。`img/` の直下のファイル名だけを許す（例: img/R4063.jpg）。
 * 画面からは GET /api/images/{key}（Access の内側）で出す。写真そのものはリポジトリに置かない
 */
const IMAGE_KEY = /^img\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/

export function isImageKey(key: string): boolean {
  return IMAGE_KEY.test(key) && !key.includes('..')
}

/** 画面で使う画像の URL */
export function imagePath(key: string): string {
  return `/api/images/${key}`
}
