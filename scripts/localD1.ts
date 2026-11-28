// ローカルの D1（wrangler dev の .wrangler/state）から、提案に使うレシピ・食材・在庫を読む（scripts の調整用）
import { spawnSync } from 'node:child_process'
import type { AvailableStock, RecIngredient, RecRecipe } from '../src/shared/domain/recommend'
import type { Cuisine, DishType } from '../src/shared/schemas/recipe'

function query<T>(sql: string): T[] {
  const res = spawnSync('npx', ['wrangler', 'd1', 'execute', 'cooking-app', '--local', '--json', '--command', sql], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  })
  if (res.status !== 0) throw new Error(`wrangler d1 execute に失敗しました:\n${res.stderr}`)
  const parsed = JSON.parse(res.stdout) as { results: T[] }[]
  return parsed[0]?.results ?? []
}

type Row = Record<string, string | number | null>

export function loadLocalD1(): {
  catalog: RecRecipe[]
  ingredients: Map<string, RecIngredient>
  available: AvailableStock[]
} {
  const ingRows = query<Row>(
    'SELECT id, name, unit, category, grams_per_unit, is_staple, can_freeze, pantry_days, prepped_fridge_days, price_yen FROM ingredients',
  )
  const units = query<Row>(
    'SELECT id, ingredient_id, label, quantity, is_default FROM package_units ORDER BY created_at, id',
  )
  const recipeRows = query<Row>(
    'SELECT id, title, servings, calories_kcal, max_servings_1_6l, hotcook_mode, dish_type, cuisine, cook_minutes, favorite_count, is_favorite, cook_count FROM recipes WHERE archived_at IS NULL',
  )
  const parts = query<Row>(
    'SELECT recipe_id, ingredient_id, quantity FROM recipe_ingredients ORDER BY recipe_id, sort_order',
  )
  const stock = query<Row>(
    'SELECT id, ingredient_id, quantity, expires_on FROM inventory_items WHERE used_up_at IS NULL AND quantity > 0',
  )
  const num = (v: Row[string] | undefined) => (v === null || v === undefined ? null : Number(v))
  const ingredients = new Map<string, RecIngredient>(
    ingRows.map((r) => [
      String(r.id),
      {
        id: String(r.id),
        name: String(r.name),
        unit: String(r.unit),
        category: String(r.category),
        gramsPerUnit: num(r.grams_per_unit),
        isStaple: r.is_staple === 1,
        canFreeze: r.can_freeze === 1,
        pantryDays: num(r.pantry_days),
        preppedFridgeDays: num(r.prepped_fridge_days),
        priceYen: num(r.price_yen),
        packageUnits: units
          .filter((u) => u.ingredient_id === r.id)
          .map((u) => ({
            id: String(u.id),
            label: String(u.label),
            quantity: Number(u.quantity),
            isDefault: u.is_default === 1,
          })),
      },
    ]),
  )
  const catalog: RecRecipe[] = recipeRows.map((r) => ({
    id: String(r.id),
    title: String(r.title),
    servings: Number(r.servings),
    caloriesKcal: num(r.calories_kcal),
    maxServings1_6l: num(r.max_servings_1_6l),
    hotcookMode: r.hotcook_mode === null ? null : String(r.hotcook_mode),
    dishType: (r.dish_type as DishType | null) ?? null,
    cuisine: (r.cuisine as Cuisine | null) ?? null,
    cookMinutes: num(r.cook_minutes),
    favoriteCount: num(r.favorite_count),
    isFavorite: r.is_favorite === 1,
    cookCount: num(r.cook_count),
    ingredients: parts
      .filter((p) => p.recipe_id === r.id)
      .map((p) => ({ ingredientId: String(p.ingredient_id), quantity: num(p.quantity) })),
  }))
  const available = stock.map((s) => ({
    inventoryItemId: String(s.id),
    ingredientId: String(s.ingredient_id),
    quantity: Number(s.quantity),
    expiresOn: String(s.expires_on),
  }))
  return { catalog, ingredients, available }
}
