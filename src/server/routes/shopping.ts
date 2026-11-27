import { Hono } from 'hono'
import { todayJst } from '../../shared/domain/date'
import { shoppingPaidSchema, shoppingPatchSchema } from '../../shared/schemas/shopping'
import type { AppEnv } from '../app'
import { createDb } from '../db/client'
import {
  checkShoppingItem,
  deleteShoppingItem,
  setShoppingItemPaid,
  uncheckShoppingItem,
  updateShoppingItem,
} from '../services/shopping'
import { validate } from '../validation'

/** /api/shopping-items（行ごとの操作。一覧と追加は /api/plans/:id/shopping） */
export const shoppingItemRoutes = new Hono<AppEnv>()
  .post('/:id/check', async (c) => c.json(await checkShoppingItem(createDb(c.env.DB), c.req.param('id'), todayJst())))
  .post('/:id/uncheck', async (c) => c.json(await uncheckShoppingItem(createDb(c.env.DB), c.req.param('id'))))
  .patch('/:id', validate('json', shoppingPatchSchema), async (c) => {
    return c.json(await updateShoppingItem(createDb(c.env.DB), c.req.param('id'), c.req.valid('json')))
  })
  .put('/:id/paid', validate('json', shoppingPaidSchema), async (c) => {
    return c.json(await setShoppingItemPaid(createDb(c.env.DB), c.req.param('id'), c.req.valid('json')))
  })
  .delete('/:id', async (c) => {
    await deleteShoppingItem(createDb(c.env.DB), c.req.param('id'))
    return c.body(null, 204)
  })
