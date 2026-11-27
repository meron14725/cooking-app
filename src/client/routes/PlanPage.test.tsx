// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockApi, renderRoutes } from '../testing/render'
import { PlanPage } from './PlanPage'

beforeEach(() => sessionStorage.clear())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const plan = {
  id: 'p1',
  status: 'draft',
  startsOn: null,
  confirmedAt: null,
  recipes: [
    {
      recipeId: 'a',
      title: '肉じゃが',
      role: 'anchor',
      servings: 1,
      dayIndex: 1,
      caloriesKcal: null,
      maxServings1_6l: 4,
    },
  ],
}

function proposal(added: string) {
  return {
    recipes: [
      { recipeId: 'a', title: '肉じゃが', role: 'anchor', servings: 1, dayIndex: 1, caloriesKcal: null },
      { recipeId: added, title: `料理${added}`, role: 'added', servings: 1, dayIndex: 2, caloriesKcal: null },
    ],
    kitLocations: [],
    score: 0,
    shopping: [],
    leftovers: [],
    usesInventory: [],
    totalCaloriesKcal: null,
    warnings: [],
    maxPerishableLeftoverPacks: 0,
  }
}

/** 候補は b〜e の 4 品。1 回に 3 案ずつ、出した案を除いて返す */
function recommendations(body: unknown) {
  const shown = new Set(((body as { exclude?: string[][] }).exclude ?? []).map((ids) => ids.join()))
  const rest = ['b', 'c', 'd', 'e'].filter((id) => !shown.has(`a,${id}`))
  return { proposals: rest.slice(0, 3).map(proposal), aiSuggestionRecommended: false, hasMore: rest.length > 3 }
}

describe('献立の提案: 別の案を出す', () => {
  it('押すと出した案を除いて次の案を出し、出し尽くしたらそう出す。選択は新しい 1 番目に戻る', async () => {
    const fetch = mockApi((path, body) => {
      if (path === '/plans/current') return { plan }
      if (path === '/plans/p1/recommendations') return recommendations(body)
      return { items: [] }
    })
    renderRoutes({ '/plan': <PlanPage /> }, '/plan')

    expect(await screen.findByRole('heading', { name: '提案（3案）' })).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: '案2を選ぶ' }))
    fireEvent.click(screen.getByRole('button', { name: '別の案を出す' }))

    expect(await screen.findByRole('heading', { name: '提案（2回目の1案）' })).toBeTruthy()
    expect(screen.getByText('料理e')).toBeTruthy()
    expect(screen.queryByText('料理b')).toBeNull()
    // 番号は回をまたいで続き、おすすめは 1 回目だけ
    expect((screen.getByRole('radio', { name: '案4を選ぶ' }) as HTMLInputElement).checked).toBe(true)
    expect(screen.queryByText('おすすめ')).toBeNull()
    expect(screen.getByRole('button', { name: '案4にする' })).toBeTruthy()
    expect(screen.getByText('これ以上の案はありません')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '別の案を出す' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '最初の案に戻る' }))
    expect(await screen.findByRole('heading', { name: '提案（3案）' })).toBeTruthy()
    expect(screen.getByText('料理b')).toBeTruthy()

    const second = fetch.mock.calls.filter(([url]) => String(url).endsWith('/recommendations'))[1]
    expect(JSON.parse(String(second?.[1]?.body))).toEqual({
      exclude: [
        ['a', 'b'],
        ['a', 'c'],
        ['a', 'd'],
      ],
    })
  })

  it('食べたい料理が変わったら 1 回目に戻る', async () => {
    sessionStorage.setItem('plan-proposals:p1', JSON.stringify({ anchors: 'x:1', round: 3, shown: [['a', 'b']] }))
    mockApi((path, body) => {
      if (path === '/plans/current') return { plan }
      if (path === '/plans/p1/recommendations') return recommendations(body)
      return { items: [] }
    })
    renderRoutes({ '/plan': <PlanPage /> }, '/plan')
    expect(await screen.findByRole('heading', { name: '提案（3案）' })).toBeTruthy()
    await waitFor(() => expect(screen.getByText('料理b')).toBeTruthy())
    // 覚えていた古い回も 1 回目で上書きされる（元の食べたい料理に戻しても復活しない）
    expect(JSON.parse(sessionStorage.getItem('plan-proposals:p1') ?? 'null')).toEqual({
      anchors: 'a:1|',
      round: 1,
      shown: [],
    })
  })
})

describe('献立の提案: 食分の ＋－', () => {
  it('押すとその料理の食分が変わり、案は切り替えず、評価し直した数字と余る食材を出す。選ぶとその食分で保存する', async () => {
    const fetch = mockApi((path, body) => {
      if (path === '/plans/current') return { plan }
      if (path === '/plans/p1/recommendations') return recommendations(body)
      if (path === '/plans/p1/evaluation') {
        const recipes = (body as { recipes: { recipeId: string; servings: number }[] }).recipes
        const sv = recipes.find((r) => r.recipeId === 'c')?.servings ?? 1
        return {
          ...proposal('c'),
          recipes: proposal('c').recipes.map((r) => ({ ...r, servings: r.recipeId === 'c' ? sv : r.servings })),
          shopping: [
            {
              ingredientId: 'i1',
              name: '玉ねぎ',
              needQuantity: 1,
              packageUnitId: null,
              packageLabel: null,
              packageCount: 1,
              buyQuantity: 1,
            },
          ],
          leftovers: [
            { ingredientId: 'i1', name: '玉ねぎ', quantity: 2, unit: '個', perishable: false, packs: 0.67 },
            { ingredientId: 'i2', name: '塩', quantity: 1, unit: 'g', perishable: false, packs: 0.01 },
            // 冷蔵のみの食材は 3% 以上なら出し、ほかの食材は 1 割未満なら出さない
            { ingredientId: 'i3', name: '豆腐', quantity: 0.05, unit: '丁', perishable: true, packs: 0.05 },
            { ingredientId: 'i4', name: 'にんじん', quantity: 0.2, unit: '本', perishable: false, packs: 0.07 },
          ],
        }
      }
      if (path === '/plans/p1/recipes') return plan
      return { items: [] }
    })
    renderRoutes({ '/plan': <PlanPage /> }, '/plan')

    // 1 回目は余りなし
    expect((await screen.findAllByText('ほぼ使い切れます')).length).toBe(3)
    fireEvent.click(screen.getByRole('button', { name: '料理c の食分を増やす' }))

    // 案1 のまま、案2（料理c）の食分と合計が変わる
    expect((screen.getByRole('radio', { name: '案1を選ぶ' }) as HTMLInputElement).checked).toBe(true)
    // 刻みは SERVINGS_STEP（2）: 1 → 2 → 4。2 より下げられず、4（MAX_SERVINGS_PER_DISH）より上げられない
    const dec = () => screen.getByRole('button', { name: '料理c の食分を減らす' }) as HTMLButtonElement
    const inc = () => screen.getByRole('button', { name: '料理c の食分を増やす' }) as HTMLButtonElement
    expect(dec().disabled).toBe(true)
    expect(screen.getByText('3食分')).toBeTruthy()
    fireEvent.click(inc())
    expect(screen.getByText('5食分')).toBeTruthy()
    expect(inc().disabled).toBe(true)
    fireEvent.click(dec())
    expect(screen.getByText('3食分')).toBeTruthy()
    // 評価し直した結果: 多めに余る玉ねぎだけラベルで出す（ごく少しの塩は数えない）
    expect(await screen.findByText('玉ねぎ 2個')).toBeTruthy()
    expect(screen.queryByText(/塩/)).toBeNull()
    expect(screen.getByText('豆腐 0.05丁')).toBeTruthy()
    expect(screen.queryByText(/にんじん/)).toBeNull()
    expect(screen.getAllByText('ほぼ使い切れます')).toHaveLength(2)

    fireEvent.click(screen.getByRole('radio', { name: '案2を選ぶ' }))
    fireEvent.click(screen.getByRole('button', { name: '案2にする' }))
    await waitFor(() => expect(fetch.mock.calls.some(([url]) => String(url).endsWith('/plans/p1/recipes'))).toBe(true))
    const put = fetch.mock.calls.find(([url]) => String(url).endsWith('/plans/p1/recipes'))
    expect(JSON.parse(String(put?.[1]?.body)).recipes).toEqual([
      { recipeId: 'a', role: 'anchor', servings: 1, dayIndex: 1 },
      { recipeId: 'c', role: 'added', servings: 2, dayIndex: 2 },
    ])
  })
})

describe('献立の提案: 鍵で固定', () => {
  it('押すとその料理と食分を固定して選び直し、行に「固定」と出して ＋－ を押せなくする。「外す」で戻る', async () => {
    const fetch = mockApi((path, body) => {
      if (path === '/plans/current') return { plan }
      if (path === '/plans/p1/recommendations') {
        const fixed = (body as { fixed?: { recipeId: string; servings: number }[] }).fixed ?? []
        const lockC = fixed.find((f) => f.recipeId === 'c')
        if (!lockC) return recommendations(body)
        // c を固定したら、c を含む案だけ返す
        const withC = (other: string) => ({
          ...proposal(other),
          recipes: [
            ...proposal(other).recipes,
            { recipeId: 'c', title: '料理c', role: 'added', servings: lockC.servings, dayIndex: 3, caloriesKcal: null },
          ],
        })
        return { proposals: [withC('d'), withC('e')], aiSuggestionRecommended: false, hasMore: false }
      }
      if (path === '/plans/p1/evaluation') {
        const recipes = (body as { recipes: { recipeId: string; servings: number }[] }).recipes
        return { ...proposal('c'), recipes: proposal('c').recipes.map((r, i) => ({ ...r, ...recipes[i] })) }
      }
      return { items: [] }
    })
    renderRoutes({ '/plan': <PlanPage /> }, '/plan')

    const inc = await screen.findByRole('button', { name: '料理c の食分を増やす' })
    expect(screen.getByText('鍵で料理と食分を固定すると、それに合わせて残りの料理を提案し直します')).toBeTruthy()
    fireEvent.click(inc)
    fireEvent.click(screen.getByRole('button', { name: '料理c の料理と食分を固定' }))

    expect(await screen.findByText('固定中：料理c 2食分')).toBeTruthy()
    expect(
      screen.getByText('この料理と食分・材料はそのままで、残り1品を余りが少なくなるように提案しています'),
    ).toBeTruthy()
    await waitFor(() => expect(screen.getByText('料理d')).toBeTruthy())
    const call = fetch.mock.calls.filter(([url]) => String(url).endsWith('/recommendations')).at(-1)
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ fixed: [{ recipeId: 'c', servings: 2 }] })
    const locks = screen.getAllByRole('button', { name: '料理c の料理と食分を固定' })
    expect(locks.every((b) => b.getAttribute('aria-pressed') === 'true')).toBe(true)
    for (const b of screen.getAllByRole('button', { name: '料理c の食分を増やす' })) {
      expect((b as HTMLButtonElement).disabled).toBe(true)
    }
    expect((screen.getByRole('radio', { name: '案1を選ぶ' }) as HTMLInputElement).checked).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: '外す' }))
    expect(await screen.findByText('鍵で料理と食分を固定すると、それに合わせて残りの料理を提案し直します')).toBeTruthy()
    await waitFor(() => expect(screen.getByText('料理b')).toBeTruthy())
  })
})
