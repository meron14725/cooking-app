// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, renderRoutes } from '../testing/render'
import { DishPhotoButton } from './DishPhoto'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** 献立の提案カードと同じ形: カード全体がラジオのラベルで、中に写真ボタン */
function Cards() {
  const [picked, setPicked] = useState(0)
  return (
    <div role="radiogroup" aria-label="提案">
      {[0, 1].map((i) => (
        <label key={i}>
          <input
            type="radio"
            name="p"
            checked={picked === i}
            onChange={() => setPicked(i)}
            aria-label={`案${i + 1}を選ぶ`}
          />
          <DishPhotoButton recipeId={`r${i}`} title={`料理${i}`} />
        </label>
      ))}
    </div>
  )
}

describe('DishPhotoButton', () => {
  it('カードの中のサムネイルを押してもカードの選択は変わらず、閉じるとサムネイルにフォーカスが戻る', async () => {
    mockApi(() => ({ items: [] }))
    renderRoutes({ '/': <Cards /> }, '/')
    const second = screen.getByRole('radio', { name: '案2を選ぶ' }) as HTMLInputElement
    expect(second.checked).toBe(false)

    const thumb = screen.getByRole('button', { name: '料理1 の写真を見る' })
    fireEvent.click(thumb)
    expect(await screen.findByRole('dialog', { name: '料理1 の写真' })).toBeTruthy()
    expect(second.checked).toBe(false)

    // パネルの中の「閉じる」（背景のボタンも「閉じる」なので最後のもの）
    const closes = screen.getAllByRole('button', { name: '閉じる' })
    fireEvent.click(closes[closes.length - 1] as HTMLElement)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(second.checked).toBe(false)
    expect(document.activeElement).toBe(thumb)
  })
})
