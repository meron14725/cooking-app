import { Hono } from 'hono'
import { todayJst } from '../shared/domain/date'
import type { AppEnv } from './app'
import { ingredientRoutes } from './routes/ingredients'
import { fridgeRoutes, inventoryRoutes } from './routes/inventory'
import { planRoutes } from './routes/plans'
import { recipeRoutes } from './routes/recipes'

/** /api 以下のルート。エンドポイントはここに足していく */
export const api = new Hono<AppEnv>()

api.get('/health', (c) => c.json({ ok: true, today: todayJst() }))
api.route('/ingredients', ingredientRoutes)
api.route('/recipes', recipeRoutes)
api.route('/inventory', inventoryRoutes)
api.route('/fridge', fridgeRoutes)
api.route('/plans', planRoutes)
