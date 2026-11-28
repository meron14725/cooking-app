// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { useNavigate } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TabBar } from '../components/TabBar'
import { mockApi, renderRoutes } from '../testing/render'
import { PlanPage } from './PlanPage'

beforeEach(() => sessionStorage.clear())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const recipes = [
  {
    recipeId: 'a',
    title: '肉じゃが',
    role: 'anchor',
    servings: 2,
    dayIndex: 1,
    caloriesKcal: null,
    maxServings1_6l: 4,
  },
  { recipeId: 'b', title: '豚汁', role: 'added', servings: 2, dayIndex: 2, caloriesKcal: null, maxServings1_6l: 4 },
]
const evaluation = {
  recipes: recipes.map(({ maxServings1_6l, ...r }) => r),
  kitLocations: [],
  score: 0,
  shopping: [],
  leftovers: [],
  usesInventory: [],
  totalCaloriesKcal: null,
  warnings: [],
  maxPerishableLeftoverPacks: 0,
}
const prepView = { kits: [], prep: { cutNow: [], keepWhole: [], asIs: [] }, shortages: [] }

/** 献立の状態をサーバ側に持つ API の代わり。確定で shopping、買い物完了で prepping になる */
function serve(status: 'draft' | 'shopping' | 'prepping') {
  let plan: Record<string, unknown> | null = {
    id: 'p1',
    status,
    startsOn: status === 'draft' ? null : '2026-11-28',
    confirmedAt: null,
    recipes,
  }
  return mockApi((path) => {
    if (path === '/plans/current') return { plan }
    if (path === '/plans/p1' && plan) {
      plan = null
      return {}
    }
    if (path === '/plans/p1/evaluation') return evaluation
    if (path === '/plans/p1/confirm') {
      plan = { ...plan, status: 'shopping', startsOn: '2026-11-28' }
      return plan
    }
    if (path === '/plans/p1/shopping/complete') {
      plan = { ...plan, status: 'prepping' }
      return plan
    }
    if (path === '/plans/p1/shopping') return { items: [], cost: null }
    if (path === '/plans/p1/kits/preview') return prepView
    return { items: [] }
  })
}

/** ホームの代わり: 献立へのリンクだけ */
function HomeStub() {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => navigate('/plan')}>
      献立を開く
    </button>
  )
}

const routes = { '/': <HomeStub />, '/fridge': <p>冷蔵庫</p>, '/plan': <PlanPage /> }
const back = () => fireEvent.click(screen.getByRole('link', { name: '戻る' }))
const heading = (name: string) => screen.findByRole('heading', { level: 1, name })

describe('献立の段階の戻るボタン', () => {
  it('献立 → 買い物リスト → 戻るで、確定した献立（見るだけ）に戻る。もう一度戻ると来た画面へ', async () => {
    serve('draft')
    const { router } = renderRoutes(routes, '/fridge')
    await router.navigate('/plan')

    fireEvent.click(await screen.findByRole('button', { name: 'この献立で確定' }))
    expect(await heading('買い物リスト')).toBeTruthy()
    expect(router.state.location.search).toBe('?step=shopping')

    back()
    expect(await heading('献立')).toBeTruthy()
    expect(screen.getByText('確定した献立です（見るだけ）')).toBeTruthy()
    // 進むボタンで買い物リストへ
    fireEvent.click(screen.getByRole('button', { name: '買い物リストへ' }))
    expect(await heading('買い物リスト')).toBeTruthy()

    // 戻る → 献立（見るだけ） → 戻る → 献立の前に見ていた冷蔵庫
    back()
    expect(await heading('献立')).toBeTruthy()
    back()
    await waitFor(() => expect(router.state.location.pathname).toBe('/fridge'))
  })

  it('買い物完了 → 下ごしらえ → 戻るで、買い物リスト（見るだけ）に戻る', async () => {
    serve('shopping')
    const { router } = renderRoutes(routes, '/')
    fireEvent.click(screen.getByRole('button', { name: '献立を開く' }))

    fireEvent.click(await screen.findByRole('button', { name: '買い物完了' }))
    expect(await heading('下ごしらえと袋詰め')).toBeTruthy()
    expect(router.state.location.search).toBe('?step=prep')

    back()
    expect(await heading('買い物リスト')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '買い物完了' })).toBeNull()
    expect(screen.getByRole('button', { name: '下ごしらえへ' })).toBeTruthy()

    // 買い物リストはホームから開いたので、もう一度戻るとホーム
    back()
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  it('ホームから買い物リストを開いて戻ると、ホームに戻る', async () => {
    serve('shopping')
    const { router } = renderRoutes(routes, '/')
    fireEvent.click(screen.getByRole('button', { name: '献立を開く' }))
    expect(await heading('買い物リスト')).toBeTruthy()
    back()
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  it('買い物リストの URL を直接開いたときだけ、自然な親（確定した献立）へ', async () => {
    serve('shopping')
    const { router } = renderRoutes(routes, '/plan?step=shopping')
    expect(await heading('買い物リスト')).toBeTruthy()
    back()
    await waitFor(() => expect(router.state.location.search).toBe('?step=plan'))
    expect(await heading('献立')).toBeTruthy()
  })

  it('下ごしらえ → 袋詰め → 戻るで、下ごしらえに戻る', async () => {
    serve('prepping')
    const { router } = renderRoutes(routes, '/')
    fireEvent.click(screen.getByRole('button', { name: '献立を開く' }))
    fireEvent.click(await screen.findByRole('button', { name: '下ごしらえ完了' }))
    await waitFor(() => expect(router.state.location.search).toBe('?step=pack'))
    expect(await screen.findByRole('button', { name: '保存完了' })).toBeTruthy()
    back()
    await waitFor(() => expect(router.state.location.search).toBe('?step=prep'))
    expect(await screen.findByRole('button', { name: '下ごしらえ完了' })).toBeTruthy()
  })
})

/** 描かれた見出しと文を、変わるたびに全部覚えておく（一瞬だけ出た画面を見つける） */
function recordScreens() {
  const seen: string[] = []
  const observer = new MutationObserver(() => seen.push(document.body.textContent ?? ''))
  observer.observe(document.body, { childList: true, subtree: true, characterData: true })
  return { seen, stop: () => observer.disconnect() }
}

describe('段階を進めた直後', () => {
  it('確定した直後に、確定した献立（見るだけ）を一瞬も出さない', async () => {
    serve('draft')
    const { router } = renderRoutes(routes, '/plan')
    const confirm = await screen.findByRole('button', { name: 'この献立で確定' })
    const rec = recordScreens()
    fireEvent.click(confirm)
    expect(await heading('買い物リスト')).toBeTruthy()
    await waitFor(() => expect(router.state.location.search).toBe('?step=shopping'))
    rec.stop()
    expect(rec.seen.some((t) => t.includes('確定した献立です（見るだけ）'))).toBe(false)
  })

  it('買い物完了の直後に、買い物リスト（見るだけ）を一瞬も出さない', async () => {
    serve('shopping')
    const { router } = renderRoutes(routes, '/plan')
    const complete = await screen.findByRole('button', { name: '買い物完了' })
    const rec = recordScreens()
    fireEvent.click(complete)
    expect(await heading('下ごしらえと袋詰め')).toBeTruthy()
    await waitFor(() => expect(router.state.location.search).toBe('?step=prep'))
    rec.stop()
    expect(rec.seen.some((t) => t.includes('下ごしらえへ'))).toBe(false)
  })
})

describe('献立をやめたあと', () => {
  it('「この献立をやめる」で URL の段階を消し、料理を選ぶところに戻る', async () => {
    serve('draft')
    const { router } = renderRoutes(routes, '/plan?step=order')
    fireEvent.click(await screen.findByRole('button', { name: 'この献立をやめる' }))
    await waitFor(() => expect(router.state.location.search).toBe(''))
    expect(router.state.location.pathname).toBe('/plan')
    expect(await heading('献立を組む')).toBeTruthy()
  })

  it('買い物中に「この献立を取り消す」でも URL の段階を消す', async () => {
    serve('shopping')
    const { router } = renderRoutes(routes, '/plan?step=shopping')
    fireEvent.click(await screen.findByRole('button', { name: 'この献立を取り消す' }))
    await waitFor(() => expect(router.state.location.search).toBe(''))
  })

  it('献立がないのに古い段階の URL を開いたら、段階を消す', async () => {
    mockApi((path) => (path === '/plans/current' ? { plan: null } : { items: [] }))
    const { router } = renderRoutes(routes, '/plan?step=prep')
    await waitFor(() => expect(router.state.location.search).toBe(''))
  })
})

describe('タブバーで献立タブを開いたとき（本番で再現した件）', () => {
  // 冷蔵庫タブ → 献立タブ → 戻る で冷蔵庫に飛んでいた。タブで開いた画面はそのタブの始まりとして、段階の親へ戻る
  const withTabs = {
    '/': (
      <>
        <p>ホーム画面</p>
        <TabBar />
      </>
    ),
    '/fridge': (
      <>
        <p>冷蔵庫</p>
        <TabBar />
      </>
    ),
    '/plan': (
      <>
        <PlanPage />
        <TabBar />
      </>
    ),
  }
  const tab = (name: string) => fireEvent.click(screen.getByRole('link', { name }))

  it('冷蔵庫 → 献立タブ（買い物リスト）→ 戻るで、冷蔵庫ではなく確定した献立へ。もう一度戻るとホーム', async () => {
    serve('shopping')
    const { router } = renderRoutes(withTabs, '/fridge')
    tab('献立')
    expect(await heading('買い物リスト')).toBeTruthy()

    back()
    expect(await heading('献立')).toBeTruthy()
    expect(router.state.location.search).toBe('?step=plan')
    expect(screen.getByText('確定した献立です（見るだけ）')).toBeTruthy()

    back()
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  it('冷蔵庫 → 献立タブ（下ごしらえ）→ 戻るを続けると、買い物リスト → 献立 → ホームの順', async () => {
    serve('prepping')
    const { router } = renderRoutes(withTabs, '/fridge')
    tab('献立')
    expect(await screen.findByRole('button', { name: '下ごしらえ完了' })).toBeTruthy()

    back()
    expect(await heading('買い物リスト')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '買い物完了' })).toBeNull()
    back()
    expect(await heading('献立')).toBeTruthy()
    back()
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  it('献立タブから先へ進んだら、戻るは履歴どおり（買い物完了 → 下ごしらえ → 戻るで買い物リスト）', async () => {
    serve('shopping')
    const { router } = renderRoutes(withTabs, '/fridge')
    tab('献立')
    fireEvent.click(await screen.findByRole('button', { name: '買い物完了' }))
    await waitFor(() => expect(router.state.location.search).toBe('?step=prep'))
    back()
    expect(await heading('買い物リスト')).toBeTruthy()
    expect(router.state.location.search).toBe('?step=shopping')
    back()
    expect(await heading('献立')).toBeTruthy()
  })
})
