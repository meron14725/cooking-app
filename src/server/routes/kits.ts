import { Hono } from 'hono'
import { todayJst } from '../../shared/domain/date'
import { kitCookedSchema, kitListQuerySchema, kitPatchSchema } from '../../shared/schemas/kit'
import type { AppEnv } from '../app'
import { createDb } from '../db/client'
import { cookKit, discardKit, getCookView, getKit, listKits, updateKit } from '../services/mealKits'
import { validate } from '../validation'

/** /api/kits（保存中の袋と調理） */
export const kitRoutes = new Hono<AppEnv>()
  .get('/', validate('query', kitListQuerySchema), async (c) => {
    return c.json({ items: await listKits(createDb(c.env.DB), todayJst(), c.req.valid('query')) })
  })
  .get('/:id', async (c) => c.json(await getKit(createDb(c.env.DB), c.req.param('id'), todayJst())))
  .get('/:id/cook', async (c) => c.json(await getCookView(createDb(c.env.DB), c.req.param('id'), todayJst())))
  .post('/:id/cooked', validate('json', kitCookedSchema), async (c) => {
    return c.json(await cookKit(createDb(c.env.DB), c.req.param('id'), c.req.valid('json'), todayJst()))
  })
  .post('/:id/discard', async (c) => c.json(await discardKit(createDb(c.env.DB), c.req.param('id'), todayJst())))
  .patch('/:id', validate('json', kitPatchSchema), async (c) => {
    return c.json(await updateKit(createDb(c.env.DB), c.req.param('id'), c.req.valid('json'), todayJst()))
  })
