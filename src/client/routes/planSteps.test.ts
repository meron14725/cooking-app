import { describe, expect, it } from 'vitest'
import { parentOf, stepView } from './planSteps'

const anchorOnly = [{ role: 'anchor' as const }]
const withAdded = [{ role: 'anchor' as const }, { role: 'added' as const }]
// stepView は status と recipes の role しか見ない
const plan = (status: 'draft' | 'shopping' | 'prepping', recipes = withAdded) =>
  ({ status, recipes }) as unknown as Parameters<typeof stepView>[0]

describe('stepView', () => {
  it('段階のない URL は、いまの段階', () => {
    expect(stepView(plan('draft', anchorOnly), null)).toEqual({ step: 'proposals', readOnly: false })
    expect(stepView(plan('draft'), null)).toEqual({ step: 'order', readOnly: false })
    expect(stepView(plan('shopping'), null)).toEqual({ step: 'shopping', readOnly: false })
    expect(stepView(plan('prepping'), null)).toEqual({ step: 'prep', readOnly: false })
  })

  it('確定後に前の段階へ戻ると見るだけ。提案・食べる順は確定した献立にまとめる', () => {
    expect(stepView(plan('shopping'), 'order')).toEqual({ step: 'plan', readOnly: true })
    expect(stepView(plan('shopping'), 'plan')).toEqual({ step: 'plan', readOnly: true })
    expect(stepView(plan('prepping'), 'shopping')).toEqual({ step: 'shopping', readOnly: true })
    expect(stepView(plan('prepping'), 'pack')).toEqual({ step: 'pack', readOnly: false })
  })

  it('まだ来ていない段階や知らない値は、いまの段階', () => {
    expect(stepView(plan('draft'), 'shopping')).toEqual({ step: 'order', readOnly: false })
    expect(stepView(plan('shopping'), 'pack')).toEqual({ step: 'shopping', readOnly: false })
    expect(stepView(plan('shopping'), 'nope')).toEqual({ step: 'shopping', readOnly: false })
  })
})

describe('parentOf（直接開いたときの戻り先）', () => {
  it('その段階の自然な親', () => {
    expect(parentOf('shopping')).toBe('/plan?step=plan')
    expect(parentOf('prep')).toBe('/plan?step=shopping')
    expect(parentOf('pack')).toBe('/plan?step=prep')
    expect(parentOf('order')).toBe('/plan?step=proposals')
    expect(parentOf('proposals')).toBe('/')
  })
})
