// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { useNavigate } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlanStepNav } from '../routes/planSteps'
import { mockApi, renderRoutes } from '../testing/render'
import { PrepAndPack } from './PrepAndPack'

beforeEach(() => sessionStorage.clear())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function kit(recipeId: string, title: string, location: string) {
  return {
    recipeId,
    title,
    servings: 2,
    plannedOn: '2026-11-28',
    location,
    defaultLocation: 'fridge',
    packedOn: '2026-11-27',
    useBy: '2026-11-29',
    items: [],
    warnings: [],
  }
}

/** 献立の画面の代わり: 段階を URL（?step=）で持って PrepAndPack に渡す */
function Harness() {
  const nav = usePlanStepNav()
  return (
    <PrepAndPack
      planId="p1"
      step={nav.requested === 'pack' ? 'pack' : 'prep'}
      onNext={() => nav.goTo('pack')}
      onBack={() => nav.backTo('prep')}
    />
  )
}

/** レシピを見るページの代わり: 戻るだけ */
function RecipeStub() {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => navigate(-1)}>
      戻る
    </button>
  )
}

describe('PrepAndPack', () => {
  it('袋詰めで冷凍に変え、料理名からレシピを見に行って戻っても、袋詰めのまま冷凍が選ばれている', async () => {
    mockApi((path, body) => {
      if (path === '/plans/p1/kits/preview') {
        const loc = Object.fromEntries(
          ((body as { kits: { recipeId: string; location: string }[] }).kits ?? []).map((k) => [
            k.recipeId,
            k.location,
          ]),
        )
        return {
          kits: [kit('r1', '麻婆豆腐', loc.r1 ?? 'fridge'), kit('r2', '肉じゃが', loc.r2 ?? 'fridge')],
          prep: { cutNow: [], keepWhole: [], asIs: [] },
          shortages: [],
        }
      }
      return { items: [] }
    })
    const { router } = renderRoutes({ '/plan': <Harness />, '/recipes/:id': <RecipeStub /> }, '/plan')

    fireEvent.click(await screen.findByRole('button', { name: '下ごしらえ完了' }))
    const freezer = () => screen.getAllByRole('button', { name: '冷凍' })[0] as HTMLElement
    await screen.findAllByRole('button', { name: '冷凍' })
    fireEvent.click(freezer())
    await waitFor(() => expect(freezer().getAttribute('aria-pressed')).toBe('true'))

    fireEvent.click(screen.getByRole('link', { name: /麻婆豆腐/ }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/recipes/r1'))
    fireEvent.click(screen.getByRole('button', { name: '戻る' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/plan'))
    expect(await screen.findByRole('button', { name: '保存完了' })).toBeTruthy()
    await waitFor(() => expect(freezer().getAttribute('aria-pressed')).toBe('true'))
    expect(screen.getAllByRole('button', { name: '冷凍' })[1]?.getAttribute('aria-pressed')).toBe('false')
  })
})
