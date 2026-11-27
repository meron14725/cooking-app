import { Hono } from 'hono'
import { todayJst } from '../../shared/domain/date'
import { fridgeQuerySchema, inventoryCreateSchema, inventoryPatchSchema } from '../../shared/schemas/inventory'
import type { AppEnv } from '../app'
import { createDb } from '../db/client'
import {
  createInventoryItem,
  listFridge,
  listInventory,
  updateInventoryItem,
  useUpInventoryItem,
} from '../services/inventory'
import { validate } from '../validation'

export const inventoryRoutes = new Hono<AppEnv>()
  .get('/', async (c) => c.json({ items: await listInventory(createDb(c.env.DB), todayJst()) }))
  .post('/', validate('json', inventoryCreateSchema), async (c) => {
    const item = await createInventoryItem(createDb(c.env.DB), c.req.valid('json'), todayJst())
    return c.json(item, 201)
  })
  .patch('/:id', validate('json', inventoryPatchSchema), async (c) => {
    const item = await updateInventoryItem(createDb(c.env.DB), c.req.param('id'), c.req.valid('json'), todayJst())
    // 量 0 で使い切ったときは 204
    return item ? c.json(item) : c.body(null, 204)
  })
  .post('/:id/use-up', async (c) => {
    await useUpInventoryItem(createDb(c.env.DB), c.req.param('id'))
    return c.body(null, 204)
  })

export const fridgeRoutes = new Hono<AppEnv>().get('/', validate('query', fridgeQuerySchema), async (c) => {
  const items = await listFridge(createDb(c.env.DB), todayJst(), c.req.valid('query'))
  return c.json({ items })
})
