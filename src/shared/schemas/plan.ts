import { z } from 'zod'
import type { Cost } from '../domain/cost'
import type { Proposal } from '../domain/recommend'

export const PLAN_STATUSES = ['draft', 'shopping', 'prepping', 'stored', 'done'] as const
export type PlanStatus = (typeof PLAN_STATUSES)[number]
export const PLAN_RECIPE_ROLES = ['anchor', 'added'] as const
export type PlanRecipeRole = (typeof PLAN_RECIPE_ROLES)[number]

export const PLAN_STATUS_LABELS: Record<PlanStatus, string> = {
  draft: '献立を組んでいる',
  shopping: '買い物中',
  prepping: '下ごしらえ中',
  stored: '袋を保存中',
  done: '完了',
}

const servingsSchema = z.number().positive('食数は 0 より大きくしてください').max(20)

export const planCreateSchema = z.object({
  anchors: z
    .array(z.object({ recipeId: z.string().min(1), servings: servingsSchema.optional() }))
    .min(1, '食べたい料理を 1 つ以上選んでください')
    .max(10),
})
export type PlanCreateInput = z.infer<typeof planCreateSchema>

export const recommendationsInputSchema = z.object({
  maxProposals: z.number().int().min(1).max(10).optional(),
  /** もう出した案（「別の案を出す」）。案ごとのレシピ ID。これらを除いた次点を返す */
  exclude: z
    .array(z.array(z.string().min(1).max(100)).max(10))
    .max(300)
    .optional(),
})
export type RecommendationsInput = z.infer<typeof recommendationsInputSchema>

export const planRecipesInputSchema = z.object({
  recipes: z
    .array(
      z.object({
        recipeId: z.string().min(1),
        role: z.enum(PLAN_RECIPE_ROLES),
        servings: servingsSchema,
        dayIndex: z.number().int().min(1).max(30),
      }),
    )
    .min(1, '料理を 1 つ以上入れてください')
    .max(10)
    .refine((list) => new Set(list.map((r) => r.recipeId)).size === list.length, '同じ料理が重なっています')
    .refine((list) => new Set(list.map((r) => r.dayIndex)).size === list.length, '同じ日に 2 品入っています'),
})
export type PlanRecipesInput = z.infer<typeof planRecipesInputSchema>

export const planConfirmSchema = z.object({ startsOn: z.iso.date('日付は YYYY-MM-DD で入れてください') })

export type PlanRecipe = {
  recipeId: string
  title: string
  role: PlanRecipeRole
  servings: number
  dayIndex: number
  caloriesKcal: number | null
  maxServings1_6l: number | null
}

export type Plan = {
  id: string
  status: PlanStatus
  startsOn: string | null
  confirmedAt: string | null
  recipes: PlanRecipe[]
}

/** 画面向けに料理名などを足した提案 */
export type ProposalView = Omit<Proposal, 'recipes'> & {
  recipes: (Proposal['recipes'][number] & { title: string; caloriesKcal: number | null })[]
  /** 推定金額（docs/design/10-cost.md） */
  cost: Cost
}

export type RecommendationsResponse = {
  proposals: ProposalView[]
  aiSuggestionRecommended: boolean
  /** 今回の案と exclude のほかに、まだ出していない組み合わせが残っているか */
  hasMore: boolean
}
