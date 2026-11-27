import { createContext, createElement, type ReactNode, useCallback, useContext, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import type { Plan, PlanStatus } from '../../shared/schemas/plan'

/**
 * 献立の画面（/plan）の段階。献立・買い物・下ごしらえ・袋詰めは同じ URL の中で中身を切り替えるので、
 * 段階を `?step=` に持ち、進むたびに履歴を積む。戻るボタン（履歴の 1 つ前）で 1 つ前の段階に戻れる
 */
export type PlanStep = 'proposals' | 'order' | 'plan' | 'shopping' | 'prep' | 'pack'

const STEPS: readonly PlanStep[] = ['proposals', 'order', 'plan', 'shopping', 'prep', 'pack']
const isPlanStep = (v: string | null): v is PlanStep => v !== null && (STEPS as readonly string[]).includes(v)

/** 画面に出す段階と、見るだけ（もう過ぎた段階）かどうか */
export type StepView = { step: PlanStep; readOnly: boolean }

/** 献立の状態でいちばん先にいる段階（URL に段階がないときに出す） */
function currentStep(plan: Pick<Plan, 'status' | 'recipes'>): PlanStep {
  if (plan.status === 'shopping') return 'shopping'
  if (plan.status === 'prepping') return 'prep'
  return plan.recipes.some((r) => r.role === 'added') ? 'order' : 'proposals'
}

/** 段階の並び（見るだけの段階を決めるのに使う） */
const ORDER: Record<PlanStep, number> = { proposals: 0, order: 0, plan: 1, shopping: 2, prep: 3, pack: 4 }
const FIRST_OF_STATUS: Record<PlanStatus, number> = { draft: 0, shopping: 2, prepping: 3, stored: 4, done: 4 }

/**
 * URL の段階を、いまの献立で出せる段階に直す。
 * - 確定前（draft）は提案か食べる順。それより先の段階（取り消した後の履歴など）はいまの段階
 * - 確定後に前の段階へ戻ったときは見るだけ（献立 = 確定した献立、買い物 = 買い物リスト）
 */
export function stepView(plan: Pick<Plan, 'status' | 'recipes'>, requested: string | null): StepView {
  const now = currentStep(plan)
  if (!isPlanStep(requested)) return { step: now, readOnly: false }
  if (plan.status === 'draft') {
    return requested === 'proposals' || requested === 'order'
      ? { step: requested, readOnly: false }
      : { step: now, readOnly: false }
  }
  const first = FIRST_OF_STATUS[plan.status]
  if (ORDER[requested] < first) {
    // 確定前の段階（提案・食べる順）は、確定した献立を見るだけにまとめる
    return { step: ORDER[requested] <= ORDER.plan ? 'plan' : requested, readOnly: true }
  }
  if (plan.status === 'prepping' && (requested === 'prep' || requested === 'pack'))
    return { step: requested, readOnly: false }
  return { step: now, readOnly: false }
}

/** 直接開いたときに戻る先（その段階の自然な親） */
export function parentOf(step: PlanStep): string {
  switch (step) {
    case 'order':
      return '/plan?step=proposals'
    case 'shopping':
      return '/plan?step=plan'
    case 'prep':
      return '/plan?step=shopping'
    case 'pack':
      return '/plan?step=prep'
    default:
      return '/'
  }
}

/**
 * 確定・買い物完了のように献立の状態を変えて先へ進むとき、進む先の段階。
 * 献立の状態は URL より先に変わるので、URL が追いつくまでの間に前の段階（見るだけ）が一瞬出ないよう、
 * この段階を URL の段階の代わりに使う
 */
const PendingStep = createContext<{ pending: PlanStep | null; setPending: (step: PlanStep | null) => void } | null>(
  null,
)

export function PlanStepProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PlanStep | null>(null)
  return createElement(PendingStep.Provider, { value: { pending, setPending } }, children)
}

/** 段階を進める（履歴を積む）。戻るボタンで前の段階に戻れる */
export function usePlanStepNav() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const location = useLocation()
  const mark = useCallback(
    (step: PlanStep) => navigate(`/plan?step=${step}`, { replace: true, state: location.state }),
    [navigate, location.state],
  )
  const pendingCtx = useContext(PendingStep)
  const requested = params.get('step')
  const goTo = (step: PlanStep) => navigate(`/plan?step=${step}`, { state: { fromStep: requested ?? true } })
  return {
    /** URL に書いてある段階 */
    requested,
    /** 進む途中の段階（URL が追いついたら消す） */
    pending: pendingCtx?.pending ?? null,
    settle: useCallback(() => pendingCtx?.setPending(null), [pendingCtx]),
    /** いまの履歴に段階を書く（置き換え。履歴は増やさない） */
    mark,
    /** 次の段階へ進む */
    goTo,
    /**
     * 献立の状態を変える操作（run）をしてから次の段階へ進む。
     * 状態が変わった瞬間から進む先の段階を出し、失敗したら元に戻す
     */
    advance: async (step: PlanStep, run: () => Promise<unknown>) => {
      pendingCtx?.setPending(step)
      try {
        await run()
      } catch (err) {
        pendingCtx?.setPending(null)
        throw err
      }
      goTo(step)
    },
    /** 段階を URL から消す（献立がなくなったとき。履歴は増やさない） */
    clear: useCallback(() => navigate('/plan', { replace: true }), [navigate]),
    /** 前の段階へ。履歴の 1 つ前がその段階ならそこへ戻り、そうでなければ置き換える */
    backTo: (step: PlanStep) => {
      const from = (location.state as { fromStep?: unknown } | null)?.fromStep
      if (from !== undefined) navigate(-1)
      else navigate(`/plan?step=${step}`, { replace: true })
    },
  }
}
