/**
 * DB スキーマ（docs/design/02-data-model.md）
 *
 * - 主キーは ULID（TEXT）
 * - 日時は ISO 8601（UTC）の TEXT、日付だけのものは YYYY-MM-DD（Asia/Tokyo）の TEXT
 * - 量はすべて食材マスタの基準単位（ingredients.unit）の数値
 * - マイグレーションは追加だけにする（削除・改名は後の PR で）
 */
import { sql } from 'drizzle-orm'
import { check, index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { PLAN_RECIPE_ROLES, PLAN_STATUSES } from '../../shared/schemas/plan'
import { RECIPE_SOURCE_TYPES, STEP_PHASES } from '../../shared/schemas/recipe'
import { ulid } from '../../shared/ulid'

export { PLAN_RECIPE_ROLES, PLAN_STATUSES, RECIPE_SOURCE_TYPES, STEP_PHASES }

// ---------- 共通 ----------

const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => ulid())

/** 現在時刻（UTC, ISO 8601）。SQL で直接 INSERT しても入るよう DB 側にも既定値を持たせる */
const nowSql = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`

const timestamps = {
  createdAt: text('created_at').notNull().default(nowSql),
  updatedAt: text('updated_at')
    .notNull()
    .default(nowSql)
    .$onUpdateFn(() => new Date().toISOString()),
}

const bool = (name: string) => integer(name, { mode: 'boolean' })

export const CATEGORIES = ['vegetable', 'meat', 'fish', 'tofu_egg_dairy', 'seasoning', 'dry', 'other'] as const
export const STORAGE_LOCATIONS = ['fridge', 'freezer', 'pantry'] as const
export const KIT_LOCATIONS = ['fridge', 'freezer'] as const
export const INVENTORY_SOURCES = ['shopping', 'leftover', 'manual'] as const
export const KIT_STATUSES = ['stored', 'cooked', 'discarded'] as const
export const KIT_ITEM_STATES = ['packed', 'before_cook', 'seasoning_packed'] as const

const inList = (column: string, values: readonly string[]) =>
  sql.raw(`${column} IN (${values.map((v) => `'${v}'`).join(', ')})`)

// ---------- 食材マスタ ----------

export const ingredients = sqliteTable(
  'ingredients',
  {
    id: id(),
    name: text('name').notNull(),
    /** 表記ゆれ（JSON 配列） */
    aliases: text('aliases', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
    category: text('category', { enum: CATEGORIES }).notNull(),
    /** 基準単位。例: 個、本、g、ml、丁 */
    unit: text('unit').notNull(),
    /** 基準単位 1 つあたりのおよその重さ（g）。基準単位が g なら NULL */
    gramsPerUnit: real('grams_per_unit'),
    canFreeze: bool('can_freeze').notNull(),
    /** 丸ごと・未開封で冷蔵したときの日持ち（日） */
    fridgeDays: integer('fridge_days').notNull(),
    freezerDays: integer('freezer_days'),
    pantryDays: integer('pantry_days'),
    /** 切った後の日持ち。NULL なら定数の上限（冷蔵 2 日 / 冷凍 21 日） */
    preppedFridgeDays: integer('prepped_fridge_days'),
    preppedFreezerDays: integer('prepped_freezer_days'),
    defaultLocation: text('default_location', { enum: STORAGE_LOCATIONS }).notNull(),
    /** 保存場所に関係なく、入れる直前に必要な作業。NULL なら直前作業なし */
    beforeCookTask: text('before_cook_task'),
    frozenCookNote: text('frozen_cook_note'),
    /** 常備品（調味料など）。使い切り計算の対象外 */
    isStaple: bool('is_staple').notNull().default(false),
    archivedAt: text('archived_at'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('ingredients_name_unique').on(t.name),
    check('ingredients_category_check', inList('category', CATEGORIES)),
    check('ingredients_default_location_check', inList('default_location', STORAGE_LOCATIONS)),
    check('ingredients_fridge_days_check', sql`${t.fridgeDays} >= 0`),
    // 冷凍できないなら冷凍の日持ちは持たない
    check('ingredients_freezer_days_check', sql`${t.canFreeze} = 1 OR ${t.freezerDays} IS NULL`),
    check('ingredients_grams_per_unit_check', sql`${t.gramsPerUnit} IS NULL OR ${t.gramsPerUnit} > 0`),
  ],
)

export const packageUnits = sqliteTable(
  'package_units',
  {
    id: id(),
    ingredientId: text('ingredient_id')
      .notNull()
      .references(() => ingredients.id, { onDelete: 'cascade' }),
    /** 例: 3個入り、1パック 200g */
    label: text('label').notNull(),
    /** 基準単位での量 */
    quantity: real('quantity').notNull(),
    /** 代表の販売単位。ムダの正規化と買い物リストの初期値に使う */
    isDefault: bool('is_default').notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index('package_units_ingredient_idx').on(t.ingredientId),
    check('package_units_quantity_check', sql`${t.quantity} > 0`),
  ],
)

// ---------- レシピ ----------

export const recipes = sqliteTable(
  'recipes',
  {
    id: id(),
    title: text('title').notNull(),
    /** 材料の量が何人前か（元のレシピのまま） */
    servings: real('servings').notNull(),
    /** 1 人前あたり */
    caloriesKcal: integer('calories_kcal'),
    /** true = AI 推定値（画面で「目安（AI推定）」と表示） */
    caloriesEstimated: bool('calories_estimated').notNull().default(false),
    hotcookMode: text('hotcook_mode'),
    /** 1.6L 機で一度に作れる最大の人数分。NULL = 不明 */
    maxServings1_6l: real('max_servings_1_6l'),
    /** true = 調味料も袋に入れる（下味冷凍） */
    packSeasonings: bool('pack_seasonings').notNull().default(false),
    sourceType: text('source_type', { enum: RECIPE_SOURCE_TYPES }).notNull(),
    sourceUrl: text('source_url'),
    notes: text('notes'),
    archivedAt: text('archived_at'),
    ...timestamps,
  },
  (t) => [
    check('recipes_servings_check', sql`${t.servings} > 0`),
    check('recipes_source_type_check', inList('source_type', RECIPE_SOURCE_TYPES)),
  ],
)

export const recipeIngredients = sqliteTable(
  'recipe_ingredients',
  {
    id: id(),
    recipeId: text('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    ingredientId: text('ingredient_id')
      .notNull()
      .references(() => ingredients.id),
    /** 基準単位、recipes.servings 人前の量。NULL = 少々・適量 */
    quantity: real('quantity'),
    displayText: text('display_text').notNull(),
    /** 切り方。NULL = 切らない */
    cutStyle: text('cut_style'),
    /** ホットクックに入れる順 */
    addOrder: integer('add_order').notNull().default(0),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index('recipe_ingredients_recipe_idx').on(t.recipeId),
    index('recipe_ingredients_ingredient_idx').on(t.ingredientId),
    check('recipe_ingredients_quantity_check', sql`${t.quantity} IS NULL OR ${t.quantity} >= 0`),
  ],
)

export const recipeSteps = sqliteTable(
  'recipe_steps',
  {
    id: id(),
    recipeId: text('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    stepNo: integer('step_no').notNull(),
    phase: text('phase', { enum: STEP_PHASES }).notNull(),
    text: text('text').notNull(),
    ...timestamps,
  },
  (t) => [
    index('recipe_steps_recipe_idx').on(t.recipeId),
    check('recipe_steps_phase_check', inList('phase', STEP_PHASES)),
  ],
)

// ---------- 在庫 ----------

export const inventoryItems = sqliteTable(
  'inventory_items',
  {
    id: id(),
    ingredientId: text('ingredient_id')
      .notNull()
      .references(() => ingredients.id),
    /** 残量（基準単位） */
    quantity: real('quantity').notNull(),
    location: text('location', { enum: STORAGE_LOCATIONS }).notNull(),
    purchasedOn: text('purchased_on').notNull(),
    expiresOn: text('expires_on').notNull(),
    source: text('source', { enum: INVENTORY_SOURCES }).notNull(),
    shoppingItemId: text('shopping_item_id').references(() => shoppingItems.id, { onDelete: 'set null' }),
    /** 使い切った日時。NULL のものが現在の在庫 */
    usedUpAt: text('used_up_at'),
    ...timestamps,
  },
  (t) => [
    index('inventory_items_ingredient_idx').on(t.ingredientId, t.expiresOn),
    // 買い物リストの 1 行から作る在庫は 1 行だけ（check の同時送信でも二重にならない）
    uniqueIndex('inventory_items_shopping_item_unique').on(t.shoppingItemId).where(sql`shopping_item_id IS NOT NULL`),
    check('inventory_items_quantity_check', sql`${t.quantity} >= 0`),
    check('inventory_items_location_check', inList('location', STORAGE_LOCATIONS)),
    check('inventory_items_source_check', inList('source', INVENTORY_SOURCES)),
  ],
)

// ---------- 献立 ----------

export const plans = sqliteTable(
  'plans',
  {
    id: id(),
    status: text('status', { enum: PLAN_STATUSES }).notNull().default('draft'),
    /** 1日目の日付（確定時に決める） */
    startsOn: text('starts_on'),
    confirmedAt: text('confirmed_at'),
    completedAt: text('completed_at'),
    ...timestamps,
  },
  () => [
    check('plans_status_check', inList('status', PLAN_STATUSES)),
    // 進行中（draft / shopping / prepping）の献立は同時に 1 つまで
    uniqueIndex('plans_one_in_progress').on(sql`(1)`).where(sql`status IN ('draft', 'shopping', 'prepping')`),
  ],
)

export const planRecipes = sqliteTable(
  'plan_recipes',
  {
    planId: text('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'cascade' }),
    recipeId: text('recipe_id')
      .notNull()
      .references(() => recipes.id),
    role: text('role', { enum: PLAN_RECIPE_ROLES }).notNull(),
    /** この献立で何食分作るか */
    servings: real('servings').notNull().default(1),
    /** 何日目に食べるか（1, 2, 3 …） */
    dayIndex: integer('day_index').notNull(),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.planId, t.recipeId] }),
    check('plan_recipes_role_check', inList('role', PLAN_RECIPE_ROLES)),
    check('plan_recipes_servings_check', sql`${t.servings} > 0`),
    check('plan_recipes_day_index_check', sql`${t.dayIndex} >= 1`),
  ],
)

export const shoppingItems = sqliteTable(
  'shopping_items',
  {
    id: id(),
    planId: text('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'cascade' }),
    ingredientId: text('ingredient_id')
      .notNull()
      .references(() => ingredients.id),
    /** 不足量（必要量 − 使える在庫） */
    needQuantity: real('need_quantity').notNull(),
    /** NULL = 量り売りなど */
    packageUnitId: text('package_unit_id').references(() => packageUnits.id, { onDelete: 'set null' }),
    packageCount: integer('package_count').notNull().default(1),
    /** 買う量（販売単位 × 個数） */
    buyQuantity: real('buy_quantity').notNull(),
    checkedAt: text('checked_at'),
    isManual: bool('is_manual').notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index('shopping_items_plan_idx').on(t.planId),
    check('shopping_items_quantities_check', sql`${t.needQuantity} >= 0 AND ${t.buyQuantity} >= 0`),
    check('shopping_items_package_count_check', sql`${t.packageCount} >= 0`),
  ],
)

// ---------- ミールキット ----------

export const mealKits = sqliteTable(
  'meal_kits',
  {
    id: id(),
    planId: text('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'cascade' }),
    recipeId: text('recipe_id')
      .notNull()
      .references(() => recipes.id),
    /** 何食分か */
    servings: real('servings').notNull(),
    location: text('location', { enum: KIT_LOCATIONS }).notNull(),
    packedOn: text('packed_on').notNull(),
    /** 食べる予定日 */
    plannedOn: text('planned_on').notNull(),
    useBy: text('use_by').notNull(),
    status: text('status', { enum: KIT_STATUSES }).notNull().default('stored'),
    cookedAt: text('cooked_at'),
    ...timestamps,
  },
  (t) => [
    // 献立 1 つにつき 1 料理 1 袋（袋の保存が二重に届いても 2 本目は batch ごと失敗する）
    uniqueIndex('meal_kits_plan_recipe_unique').on(t.planId, t.recipeId),
    index('meal_kits_status_idx').on(t.status, t.plannedOn),
    check('meal_kits_location_check', inList('location', KIT_LOCATIONS)),
    check('meal_kits_status_check', inList('status', KIT_STATUSES)),
  ],
)

/**
 * 袋の中身と直前作業。
 * state = before_cook の行は「この袋のために確保している在庫」。確保は量だけで持ち、
 * 袋が stored の間だけ数える（cooked / discarded になれば自動で解放される）。
 */
export const mealKitItems = sqliteTable(
  'meal_kit_items',
  {
    id: id(),
    mealKitId: text('meal_kit_id')
      .notNull()
      .references(() => mealKits.id, { onDelete: 'cascade' }),
    ingredientId: text('ingredient_id')
      .notNull()
      .references(() => ingredients.id),
    /** 基準単位（スケール後） */
    quantity: real('quantity'),
    state: text('state', { enum: KIT_ITEM_STATES }).notNull(),
    beforeCookTask: text('before_cook_task'),
    ...timestamps,
  },
  (t) => [
    index('meal_kit_items_kit_idx').on(t.mealKitId),
    index('meal_kit_items_ingredient_idx').on(t.ingredientId, t.state),
    check('meal_kit_items_state_check', inList('state', KIT_ITEM_STATES)),
  ],
)
