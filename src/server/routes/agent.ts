import { Hono } from 'hono'
import { todayJst } from '../../shared/domain/date'
import { agentApplySchema, agentRequestSchema } from '../../shared/schemas/agent'
import { getAgentRunner } from '../ai/agent'
import type { AppEnv } from '../app'
import { createDb } from '../db/client'
import { applyOperations, requestAgent } from '../services/agent'
import { validate } from '../validation'

/** /api/agent（AI に頼む。docs/design/08-agent.md） */
export const agentRoutes = new Hono<AppEnv>()
  // 変更案を作る。DB は変えない
  .post('/requests', validate('json', agentRequestSchema), async (c) => {
    const runner = getAgentRunner(c.env)
    return c.json(await requestAgent(createDb(c.env.DB), runner, c.req.valid('json').instruction, todayJst()))
  })
  // 本人が選んだ変更案を反映する
  .post('/apply', validate('json', agentApplySchema), async (c) => {
    return c.json(await applyOperations(createDb(c.env.DB), c.req.valid('json'), todayJst()))
  })
