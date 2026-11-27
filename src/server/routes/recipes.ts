import { Hono } from 'hono'
import { z } from 'zod'
import { recipeInputSchema, recipeSortSchema } from '../../shared/schemas/recipe'
import {
  estimateCaloriesInputSchema,
  importUrlInputSchema,
  suggestRecipeInputSchema,
} from '../../shared/schemas/recipeDraft'
import { getProvider } from '../ai'
import type { AppEnv } from '../app'
import { createDb } from '../db/client'
import { ApiError } from '../errors'
import { cocoroOfficial, cocoroSourceText, fetchCocoroRecipe, parseCocoroUrl } from '../services/cocoro'
import { listIngredients } from '../services/ingredients'
import { assertPublicUrl, buildSourceText, fetchPage, normalizeDraft } from '../services/recipeImport'
import { archiveRecipe, createRecipe, getRecipe, listRecipes, updateRecipe } from '../services/recipes'
import { validate } from '../validation'

const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  ingredientId: z.string().min(1).optional(),
  sort: recipeSortSchema.optional(),
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
    // COCORO KITCHEN のページは HTML に本文がないので、レシピ 1 件の JSON API を取る（services/cocoro.ts）
    const cocoro = parseCocoroUrl(url)
    const [source, masters] = await Promise.all([
      cocoro
        ? fetchCocoroRecipe(cocoro).then((recipe) => ({
            text: cocoroSourceText(recipe),
            official: cocoroOfficial(recipe, cocoro),
          }))
        : fetchPage(url).then((html) => ({ text: buildSourceText(html).text, official: null })),
      listIngredients(db),
    ])
    const raw = await ai.extractRecipe({
      url: url.toString(),
      text: source.text,
      ingredients: masters.map((m) => ({ name: m.name, unit: m.unit, gramsPerUnit: m.gramsPerUnit })),
    })
    return c.json({ ...normalizeDraft(raw, masters, url.toString()), official: source.official })
  })
  // 余りそうな食材から 1 品の下書きを作る（保存しない。docs/design/06-ai.md「補完レシピ提案の流れ」）
  .post('/suggest', validate('json', suggestRecipeInputSchema), async (c) => {
    const ai = getProvider(c.env)
    const db = createDb(c.env.DB)
    const [masters, catalog] = await Promise.all([listIngredients(db), listRecipes(db)])
    const byId = new Map(masters.map((m) => [m.id, m]))
    const leftovers = c.req.valid('json').leftovers.flatMap((l) => {
      const m = byId.get(l.ingredientId)
      return m ? [{ name: m.name, quantity: l.quantity, unit: m.unit }] : []
    })
    if (leftovers.length === 0) throw new ApiError(400, 'UNKNOWN_INGREDIENT', '食材マスタにない食材です')
    const raw = await ai.suggestRecipe({
      leftovers,
      avoidTitles: catalog.map((r) => r.title),
      ingredients: masters.map((m) => ({ name: m.name, unit: m.unit, gramsPerUnit: m.gramsPerUnit })),
    })
    return c.json(normalizeDraft(raw, masters, null))
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
