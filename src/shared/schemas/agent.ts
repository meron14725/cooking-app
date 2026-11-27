import { z } from 'zod'

/** 「AI に頼む」（docs/design/08-agent.md）。エージェントが出す変更案の種類 */
export const AGENT_OPS = [
  'inventory.add',
  'inventory.update',
  'inventory.use_up',
  'recipe.create',
  'recipe.update',
  'shopping.add',
  'shopping.update',
  'shopping.delete',
  'shopping.check',
  'plan.create',
  'plan.set_recipes',
] as const
export type AgentOp = (typeof AGENT_OPS)[number]

export const agentRequestSchema = z.object({
  instruction: z.string().trim().min(1, '頼みたいことを書いてください').max(500, '500 文字までにしてください'),
})
export type AgentRequestInput = z.infer<typeof agentRequestSchema>

/** 変更案 1 件。input は op ごとのスキーマで反映の前にもう一度検証する */
export const agentOperationSchema = z.object({
  op: z.enum(AGENT_OPS),
  targetId: z.string().min(1).nullable(),
  input: z.unknown(),
  summary: z.string().max(1000),
  /** スナップショットを作った時点の対象の updated_at（Worker が入れる）。add / create は null */
  baseUpdatedAt: z.iso.datetime().nullable(),
})
export type AgentOperation = z.infer<typeof agentOperationSchema>

export const agentApplySchema = z.object({
  operations: z.array(agentOperationSchema).min(1, '反映するものを選んでください').max(20),
})
export type AgentApplyInput = z.infer<typeof agentApplySchema>

export type AgentResult = {
  /** エージェントの返事 */
  reply: string
  operations: AgentOperation[]
  /** 形が違うなどで捨てた変更案の理由 */
  warnings: string[]
}

export type AgentApplyResult = { results: { ok: boolean; error?: string }[] }
