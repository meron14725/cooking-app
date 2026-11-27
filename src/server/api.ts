import { Hono } from 'hono'
import { todayJst } from '../shared/domain/date'
import type { AppEnv } from './app'
import { agentRoutes } from './routes/agent'
import { imageRoutes } from './routes/images'
import { ingredientRoutes } from './routes/ingredients'
import { fridgeRoutes, inventoryRoutes } from './routes/inventory'
import { kitRoutes } from './routes/kits'
import { planRoutes } from './routes/plans'
import { recipeRoutes } from './routes/recipes'
import { shoppingItemRoutes } from './routes/shopping'

/** /api 以下のルート。エンドポイントはここに足していく */
export const api = new Hono<AppEnv>()

api.get('/health', (c) => c.json({ ok: true, today: todayJst() }))
api.route('/ingredients', ingredientRoutes)
api.route('/recipes', recipeRoutes)
api.route('/inventory', inventoryRoutes)
api.route('/fridge', fridgeRoutes)
api.route('/plans', planRoutes)
api.route('/shopping-items', shoppingItemRoutes)
api.route('/kits', kitRoutes)
api.route('/agent', agentRoutes)
// レシピ写真（R2）。Access の内側でだけ見える
api.route('/images', imageRoutes)
