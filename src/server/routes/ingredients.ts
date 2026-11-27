import { Hono } from 'hono'
import { z } from 'zod'
import { categorySchema, ingredientInputSchema } from '../../shared/schemas/ingredient'
import type { AppEnv } from '../app'
import { createDb } from '../db/client'
import {
  archiveIngredient,
  createIngredient,
  getIngredient,
  listIngredients,
  updateIngredient,
} from '../services/ingredients'
import { validate } from '../validation'

const listQuerySchema = z.object({
  q: z.string().trim().max(50).optional(),
  category: categorySchema.optional(),
})

export const ingredientRoutes = new Hono<AppEnv>()
  .get('/', validate('query', listQuerySchema), async (c) => {
    const items = await listIngredients(createDb(c.env.DB), c.req.valid('query'))
    return c.json({ items })
  })
  .post('/', validate('json', ingredientInputSchema), async (c) => {
    const item = await createIngredient(createDb(c.env.DB), c.req.valid('json'))
    return c.json(item, 201)
  })
  .get('/:id', async (c) => c.json(await getIngredient(createDb(c.env.DB), c.req.param('id'))))
  .put('/:id', validate('json', ingredientInputSchema), async (c) => {
    const item = await updateIngredient(createDb(c.env.DB), c.req.param('id'), c.req.valid('json'))
    return c.json(item)
  })
  .delete('/:id', async (c) => {
    await archiveIngredient(createDb(c.env.DB), c.req.param('id'))
    return c.body(null, 204)
  })
