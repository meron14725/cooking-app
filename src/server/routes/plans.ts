import { Hono } from 'hono'
import { todayJst } from '../../shared/domain/date'
import {
  planConfirmSchema,
  planCreateSchema,
  planRecipesInputSchema,
  recommendationsInputSchema,
} from '../../shared/schemas/plan'
import type { AppEnv } from '../app'
import { createDb } from '../db/client'
import {
  confirmPlan,
  createPlan,
  deletePlan,
  evaluatePlanById,
  getCurrentPlan,
  getPlan,
  recommendForPlan,
  replacePlanRecipes,
} from '../services/plans'
import { validate } from '../validation'

export const planRoutes = new Hono<AppEnv>()
  .get('/current', async (c) => c.json({ plan: await getCurrentPlan(createDb(c.env.DB)) }))
  .post('/', validate('json', planCreateSchema), async (c) => {
    return c.json(await createPlan(createDb(c.env.DB), c.req.valid('json')), 201)
  })
  .get('/:id', async (c) => c.json(await getPlan(createDb(c.env.DB), c.req.param('id'))))
  .post('/:id/recommendations', validate('json', recommendationsInputSchema), async (c) => {
    const result = await recommendForPlan(createDb(c.env.DB), c.req.param('id'), todayJst(), c.req.valid('json'))
    return c.json(result)
  })
  .get('/:id/evaluation', async (c) =>
    c.json(await evaluatePlanById(createDb(c.env.DB), c.req.param('id'), todayJst())),
  )
  .put('/:id/recipes', validate('json', planRecipesInputSchema), async (c) => {
    return c.json(await replacePlanRecipes(createDb(c.env.DB), c.req.param('id'), c.req.valid('json')))
  })
  .post('/:id/confirm', validate('json', planConfirmSchema), async (c) => {
    return c.json(await confirmPlan(createDb(c.env.DB), c.req.param('id'), c.req.valid('json').startsOn))
  })
  .delete('/:id', async (c) => {
    await deletePlan(createDb(c.env.DB), c.req.param('id'))
    return c.body(null, 204)
  })
