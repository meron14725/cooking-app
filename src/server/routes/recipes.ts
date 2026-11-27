import { Hono } from 'hono'
import { z } from 'zod'
import { estimateAttributesInputSchema } from '../../shared/schemas/attributes'
import { recipeFavoriteInputSchema, recipeInputSchema, recipeSortSchema } from '../../shared/schemas/recipe'
import {
  draftInputSchema,
  estimateCaloriesInputSchema,
  type RecipeDraft,
  splitUrl,
  suggestRecipeInputSchema,
} from '../../shared/schemas/recipeDraft'
import { getProvider } from '../ai'
import type { AppEnv } from '../app'
import type { Db } from '../db/client'
import { createDb } from '../db/client'
import { ApiError } from '../errors'
import { estimateAttributes } from '../services/attributes'
import {
  cocoroDraftRaw,
  cocoroHotcookMode,
  cocoroOfficial,
  cocoroSourceText,
  fetchCocoroRecipe,
  parseCocoroUrl,
} from '../services/cocoro'
import { listIngredients } from '../services/ingredients'
import { assertPublicUrl, buildSourceText, fetchPage, normalizeDraft } from '../services/recipeImport'
import {
  archiveRecipe,
  createRecipe,
  getRecipe,
  listRecipes,
  setRecipeFavorite,
  updateRecipe,
} from '../services/recipes'
import { validate } from '../validation'

const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  ingredientId: z.string().min(1).optional(),
  sort: recipeSortSchema.optional(),
})

const masterRefs = (masters: { name: string; unit: string; gramsPerUnit: number | null }[]) =>
  masters.map((m) => ({ name: m.name, unit: m.unit, gramsPerUnit: m.gramsPerUnit }))

const withMemo = (text: string, memo: string) =>
  memo ? `${text}\n\n## 利用者のメモ（ページより優先する）\n${memo}` : text

/**
 * 「＋」に貼られた URL から下書きを作る（保存しない）。memo があれば利用者のメモとして本文の後ろに付けて AI に読ませる。
 * COCORO KITCHEN の URL はページの HTML ではなくレシピ 1 件の JSON API を取り、メモがなければ AI を使わずに
 * JSON から下書きを組み立てる（services/cocoro.ts）
 */
async function draftFromUrl(env: Env, db: Db, rawUrl: string, memo = ''): Promise<RecipeDraft> {
  const url = assertPublicUrl(rawUrl)
  const cocoro = parseCocoroUrl(url)
  if (cocoro) {
    const [recipe, masters] = await Promise.all([fetchCocoroRecipe(cocoro), listIngredients(db)])
    const official = cocoroOfficial(recipe, cocoro)
    if (!memo) return { ...normalizeDraft(cocoroDraftRaw(recipe), masters, url.toString()), official }
    const raw = await getProvider(env).extractRecipe({
      url: url.toString(),
      text: withMemo(cocoroSourceText(recipe), memo),
      ingredients: masterRefs(masters),
    })
    // メニュー番号はAIに任せず JSON の値を使う
    const hotcookMode = cocoroHotcookMode(recipe) ?? raw.hotcookMode
    return { ...normalizeDraft({ ...raw, hotcookMode }, masters, url.toString()), official }
  }
  const ai = getProvider(env)
  const [html, masters] = await Promise.all([fetchPage(url), listIngredients(db)])
  const raw = await ai.extractRecipe({
    url: url.toString(),
    text: withMemo(buildSourceText(html).text, memo),
    ingredients: masterRefs(masters),
  })
  return { ...normalizeDraft(raw, masters, url.toString()), official: null }
}

export const recipeRoutes = new Hono<AppEnv>()
  .get('/', validate('query', listQuerySchema), async (c) => {
    const items = await listRecipes(createDb(c.env.DB), c.req.valid('query'))
    return c.json({ items })
  })
  .post('/', validate('json', recipeInputSchema), async (c) => {
    const item = await createRecipe(createDb(c.env.DB), c.req.valid('json'))
    return c.json(item, 201)
  })
  // 「＋」のパネル: URL・メモ・料理名など何でも受けて下書きを作る（保存しない）。
  // URL を含めばそのページから（残りの文はメモとして AI に渡す。docs/design/06-ai.md「URL 取り込みの流れ」）、
  // なければ文から AI が下書きを作る
  .post('/draft', validate('json', draftInputSchema), async (c) => {
    const db = createDb(c.env.DB)
    const { url, memo } = splitUrl(c.req.valid('json').text)
    if (url) return c.json(await draftFromUrl(c.env, db, url, memo))
    const ai = getProvider(c.env)
    const masters = await listIngredients(db)
    const raw = await ai.draftFromText({ text: memo, ingredients: masterRefs(masters) })
    return c.json(normalizeDraft(raw, masters, null))
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
      ingredients: masterRefs(masters),
    })
    return c.json(normalizeDraft(raw, masters, null))
  })
  // 材料と人数から 1 人前のカロリーを推定する（保存しない）
  .post('/estimate-calories', validate('json', estimateCaloriesInputSchema), async (c) => {
    const result = await getProvider(c.env).estimateCalories(c.req.valid('json'))
    return c.json(result)
  })
  // 食材の分類・重さ・価格とレシピの区分・系統をまとめて推定して保存する（docs/design/09-recommendation-v2.md・10-cost.md）
  .post('/attributes/estimate', validate('json', estimateAttributesInputSchema), async (c) => {
    return c.json(await estimateAttributes(createDb(c.env.DB), () => getProvider(c.env), c.req.valid('json')))
  })
  .get('/:id', async (c) => c.json(await getRecipe(createDb(c.env.DB), c.req.param('id'))))
  .put('/:id', validate('json', recipeInputSchema), async (c) => {
    const item = await updateRecipe(createDb(c.env.DB), c.req.param('id'), c.req.valid('json'))
    return c.json(item)
  })
  // 自分のお気に入りを付ける・外す
  .put('/:id/favorite', validate('json', recipeFavoriteInputSchema), async (c) => {
    const item = await setRecipeFavorite(createDb(c.env.DB), c.req.param('id'), c.req.valid('json').favorite)
    return c.json(item)
  })
  .delete('/:id', async (c) => {
    await archiveRecipe(createDb(c.env.DB), c.req.param('id'))
    return c.body(null, 204)
  })
