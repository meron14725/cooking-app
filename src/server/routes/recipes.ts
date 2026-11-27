import { Hono } from 'hono'
import { z } from 'zod'
import { recipeInputSchema } from '../../shared/schemas/recipe'
import { estimateCaloriesInputSchema, importUrlInputSchema } from '../../shared/schemas/recipeDraft'
import { getProvider } from '../ai'
import type { AppEnv } from '../app'
import { createDb } from '../db/client'
import { listIngredients } from '../services/ingredients'
import { assertPublicUrl, buildSourceText, fetchPage, normalizeDraft } from '../services/recipeImport'
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
  // URL から下書きを作る（保存しない。docs/design/06-ai.md「URL 取り込みの流れ」）
  .post('/import-url', validate('json', importUrlInputSchema), async (c) => {
    const url = assertPublicUrl(c.req.valid('json').url)
    const ai = getProvider(c.env)
    const db = createDb(c.env.DB)
    const [html, masters] = await Promise.all([fetchPage(url), listIngredients(db)])
    const { text } = buildSourceText(html)
    const raw = await ai.extractRecipe({
      url: url.toString(),
      text,
      ingredients: masters.map((m) => ({ name: m.name, unit: m.unit, gramsPerUnit: m.gramsPerUnit })),
    })
    return c.json(normalizeDraft(raw, masters, url.toString()))
  })
  // 材料と人数から 1 人前のカロリーを推定する（保存しない）
  .post('/estimate-calories', validate('json', estimateCaloriesInputSchema), async (c) => {
    const result = await getProvider(c.env).estimateCalories(c.req.valid('json'))
    return c.json(result)
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
