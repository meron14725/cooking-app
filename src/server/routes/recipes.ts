import { Hono } from 'hono'
import { z } from 'zod'
import { recipeInputSchema } from '../../shared/schemas/recipe'
import type { AppEnv } from '../app'
import { createDb } from '../db/client'
import { archiveRecipe, createRecipe, getRecipe, listRecipes, updateRecipe } from '../services/recipes'
import { validate } from '../validation'

const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  ingredientId: z.string().min(1).optional(),
})

export const recipeRoutes = new Hono<AppEnv>()
  .get('/', validate('query', listQuerySchema), async (c) => {
    const items = await listRecipes(createDb(c.env.DB), c.req.valid('query'))
    return c.json({ items })
  })
  .post('/', validate('json', recipeInputSchema), async (c) => {
    const item = await createRecipe(createDb(c.env.DB), c.req.valid('json'))
    return c.json(item, 201)
  })
  .get('/:id', async (c) => c.json(await getRecipe(createDb(c.env.DB), c.req.param('id'))))
  .put('/:id', validate('json', recipeInputSchema), async (c) => {
    const item = await updateRecipe(createDb(c.env.DB), c.req.param('id'), c.req.valid('json'))
    return c.json(item)
  })
  .delete('/:id', async (c) => {
    await archiveRecipe(createDb(c.env.DB), c.req.param('id'))
    return c.body(null, 204)
  })
