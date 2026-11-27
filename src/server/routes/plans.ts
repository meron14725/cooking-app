import { Hono } from 'hono'
import { todayJst } from '../../shared/domain/date'
import { kitsInputSchema } from '../../shared/schemas/kit'
import {
  planConfirmSchema,
  planCreateSchema,
  planRecipesInputSchema,
  recommendationsInputSchema,
} from '../../shared/schemas/plan'
import { shoppingAddSchema } from '../../shared/schemas/shopping'
import type { AppEnv } from '../app'
import { createDb } from '../db/client'
import { previewPrep, saveKits } from '../services/kits'
import {
  confirmPlan,
  createPlan,
  deletePlan,
  evaluateDraftRecipes,
  evaluatePlanById,
  getCurrentPlan,
  getPlan,
  recommendForPlan,
  replacePlanRecipes,
} from '../services/plans'
import { addShoppingItem, completeShopping, listShopping } from '../services/shopping'
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
  .post('/:id/evaluation', validate('json', planRecipesInputSchema), async (c) =>
    c.json(await evaluateDraftRecipes(createDb(c.env.DB), c.req.param('id'), c.req.valid('json'), todayJst())),
  )
  .put('/:id/recipes', validate('json', planRecipesInputSchema), async (c) => {
    return c.json(await replacePlanRecipes(createDb(c.env.DB), c.req.param('id'), c.req.valid('json')))
  })
  .post('/:id/confirm', validate('json', planConfirmSchema), async (c) => {
    return c.json(await confirmPlan(createDb(c.env.DB), c.req.param('id'), c.req.valid('json').startsOn, todayJst()))
  })
  .get('/:id/shopping', async (c) => c.json(await listShopping(createDb(c.env.DB), c.req.param('id'))))
  .post('/:id/shopping', validate('json', shoppingAddSchema), async (c) => {
    return c.json(await addShoppingItem(createDb(c.env.DB), c.req.param('id'), c.req.valid('json')), 201)
  })
  .post('/:id/shopping/complete', async (c) => {
    await completeShopping(createDb(c.env.DB), c.req.param('id'))
    return c.json(await getPlan(createDb(c.env.DB), c.req.param('id')))
  })
  .get('/:id/prep', async (c) => c.json(await previewPrep(createDb(c.env.DB), c.req.param('id'), todayJst())))
  .post('/:id/kits/preview', validate('json', kitsInputSchema), async (c) => {
    const locations = new Map(c.req.valid('json').kits.map((k) => [k.recipeId, k.location]))
    return c.json(await previewPrep(createDb(c.env.DB), c.req.param('id'), todayJst(), locations))
  })
  .post('/:id/kits', validate('json', kitsInputSchema), async (c) => {
    const kits = await saveKits(createDb(c.env.DB), c.req.param('id'), c.req.valid('json'), todayJst())
    return c.json({ kits }, 201)
  })
  .delete('/:id', async (c) => {
    await deletePlan(createDb(c.env.DB), c.req.param('id'))
    return c.body(null, 204)
  })
