import { eq, isNull, sql } from 'drizzle-orm'
import { type ZodType, z } from 'zod'
import type {
  AgentApplyInput,
  AgentApplyResult,
  AgentOp,
  AgentOperation,
  AgentResult,
} from '../../shared/schemas/agent'
import { LOCATION_OPTIONS, type StorageLocation } from '../../shared/schemas/ingredient'
import { inventoryCreateSchema, inventoryPatchSchema } from '../../shared/schemas/inventory'
import { planCreateSchema, planRecipesInputSchema } from '../../shared/schemas/plan'
import { recipeInputSchema } from '../../shared/schemas/recipe'
import { shoppingAddSchema, shoppingPatchSchema } from '../../shared/schemas/shopping'
import type { AgentOpTool, AgentReadTool, AgentRunner } from '../ai/agent'
import { AGENT_SYSTEM } from '../ai/prompts'
import type { Db } from '../db/client'
import { inventoryItems, plans, recipes, shoppingItems } from '../db/schema'
import { ApiError } from '../errors'
import { listIngredients } from './ingredients'
import { createInventoryItem, listInventory, updateInventoryItem, useUpInventoryItem } from './inventory'
import { createPlan, getCurrentPlan, replacePlanRecipes } from './plans'
import { createRecipe, getRecipe, listRecipes, updateRecipe } from './recipes'
import { addShoppingItem, checkShoppingItem, deleteShoppingItem, listShopping, updateShoppingItem } from './shopping'

/**
 * 「AI に頼む」（docs/design/08-agent.md）。
 * エージェントは読む道具（スナップショット）と変更案の道具だけを持つ。DB を変えるのは applyOperations だけで、
 * 本人が画面で選んだ変更案を、画面から直接 API を呼ぶのと同じサービス関数で反映する
 */

type Target = 'inventory' | 'shopping' | 'recipe' | 'plan'

type Snapshot = Awaited<ReturnType<typeof buildSnapshot>>

type OpDef = {
  tool: string
  description: string
  /** 変える行の種類。add / create は null */
  target: Target | null
  /** 反映すると対象の updated_at が変わるか（shopping.add は献立を対象にするが献立の行は変えない） */
  keepsTarget?: boolean
  /** 入力のスキーマ。use_up / delete / check は入力なし */
  input: ZodType | null
  summarize: (snap: Snapshot, targetId: string | null, input: never) => string
  apply: (db: Db, targetId: string | null, input: never, today: string) => Promise<unknown>
}

const fmt = (n: number) => `${Math.round(n * 100) / 100}`
const LOC = Object.fromEntries(LOCATION_OPTIONS.map((o) => [o.value, o.label])) as Record<StorageLocation, string>

function def<I>(d: {
  tool: string
  description: string
  target: Target | null
  keepsTarget?: boolean
  input: ZodType<I> | null
  summarize: (snap: Snapshot, targetId: string | null, input: I) => string
  apply: (db: Db, targetId: string | null, input: I, today: string) => Promise<unknown>
}): OpDef {
  return d as unknown as OpDef
}

const need = (id: string | null) => {
  if (!id) throw new ApiError(400, 'BAD_REQUEST', '対象がありません')
  return id
}

const OPS: Record<AgentOp, OpDef> = {
  'inventory.add': def({
    tool: 'propose_inventory_add',
    description: '在庫に食材を足す案。量は食材マスタの基準単位。期限・場所は省略すると自動',
    target: null,
    input: inventoryCreateSchema,
    summarize: (snap, _, i) => {
      const m = snap.ingredientsById.get(i.ingredientId)
      return `在庫に追加: ${m?.name ?? '?'} ${fmt(i.quantity)}${m?.unit ?? ''}${i.location ? `（${LOC[i.location]}）` : ''}${i.expiresOn ? `、期限 ${i.expiresOn}` : ''}`
    },
    apply: (db, _, i, today) => createInventoryItem(db, i, today),
  }),
  'inventory.update': def({
    tool: 'propose_inventory_update',
    description: '在庫の行の量・場所・期限を直す案。量 0 は使い切り。同じ行への変更は 1 つにまとめる',
    target: 'inventory',
    input: inventoryPatchSchema,
    summarize: (snap, id, i) => {
      const b = snap.inventoryById.get(id ?? '')
      if (!b) return '在庫の変更'
      const parts: string[] = []
      if (i.quantity !== undefined) {
        parts.push(i.quantity === 0 ? '使い切り' : `${fmt(b.quantity)}${b.unit} → ${fmt(i.quantity)}${b.unit}`)
      }
      if (i.location && i.location !== b.location) parts.push(`${LOC[b.location]} → ${LOC[i.location]}`)
      if (i.expiresOn && i.expiresOn !== b.expiresOn) parts.push(`期限 ${b.expiresOn} → ${i.expiresOn}`)
      return `在庫 ${b.name}: ${parts.join('、') || '変更なし'}`
    },
    apply: (db, id, i, today) => updateInventoryItem(db, need(id), i, today),
  }),
  'inventory.use_up': def({
    tool: 'propose_inventory_use_up',
    description: '在庫の行を使い切りにする案',
    target: 'inventory',
    input: null,
    summarize: (snap, id) => {
      const b = snap.inventoryById.get(id ?? '')
      return `在庫 ${b?.name ?? '?'} ${b ? `${fmt(b.quantity)}${b.unit} ` : ''}を使い切り`
    },
    apply: (db, id) => useUpInventoryItem(db, need(id)),
  }),
  'recipe.create': def({
    tool: 'propose_recipe_create',
    description: 'レシピを新しく登録する案。材料は食材マスタにある食材だけ（ingredientId）',
    target: null,
    input: recipeInputSchema,
    summarize: (_, __, i) => `レシピを追加: ${i.title}（${i.servings}人前、材料 ${i.ingredients.length} 品）`,
    apply: (db, _, i) => createRecipe(db, { ...i, sourceType: 'ai' }),
  }),
  'recipe.update': def({
    tool: 'propose_recipe_update',
    description: 'レシピを丸ごと置き換える案。先に get_recipe で今の内容を読み、変えないところもそのまま入れる',
    target: 'recipe',
    input: recipeInputSchema,
    summarize: (snap, id, i) => {
      const b = snap.recipesById.get(id ?? '')
      if (!b) return `レシピを更新: ${i.title}`
      const parts: string[] = []
      if (b.title !== i.title) parts.push(`料理名 ${b.title} → ${i.title}`)
      if (b.servings !== i.servings) parts.push(`${b.servings}人前 → ${i.servings}人前`)
      const before = b.ingredients.map((x) => x.displayText)
      const after = i.ingredients.map((x) => x.displayText)
      const removed = before.filter((t) => !after.includes(t))
      const added = after.filter((t) => !before.includes(t))
      if (removed.length) parts.push(`材料から外す: ${removed.join('、')}`)
      if (added.length) parts.push(`材料に入れる: ${added.join('、')}`)
      if (JSON.stringify(b.steps.map((s) => s.text)) !== JSON.stringify((i.steps ?? []).map((s) => s.text))) {
        parts.push('手順を変更')
      }
      return `レシピ「${b.title}」を更新: ${parts.join('、') || 'ほかの項目だけ変更'}`
    },
    apply: (db, id, i) => updateRecipe(db, need(id), i),
  }),
  'shopping.add': def({
    tool: 'propose_shopping_add',
    description: '買い物リストに行を足す案。targetId は進行中の献立の id（献立が買い物中のときだけ）',
    target: 'plan',
    keepsTarget: true,
    input: shoppingAddSchema,
    summarize: (snap, _, i) => {
      const m = snap.ingredientsById.get(i.ingredientId)
      const pkg = m?.packageUnits.find((p) => p.id === i.packageUnitId)
      return `買い物リストに追加: ${m?.name ?? '?'} ${pkg ? `${pkg.label} × ${i.packageCount ?? 1}` : `${fmt(i.quantity ?? 0)}${m?.unit ?? ''}`}`
    },
    apply: (db, id, i) => addShoppingItem(db, need(id), i),
  }),
  'shopping.update': def({
    tool: 'propose_shopping_update',
    description: '買い物リストの行のパック・個数・量を直す案',
    target: 'shopping',
    input: shoppingPatchSchema,
    summarize: (snap, id, i) => {
      const b = snap.shoppingById.get(id ?? '')
      const before = b
        ? b.packageLabel
          ? `${b.packageLabel} × ${b.packageCount}`
          : `${fmt(b.buyQuantity)}${b.unit}`
        : '?'
      const pkg = b?.packageUnits.find((p) => p.id === i.packageUnitId)
      const after = pkg
        ? `${pkg.label} × ${i.packageCount ?? b?.packageCount ?? 1}`
        : i.quantity !== undefined
          ? `${fmt(i.quantity)}${b?.unit ?? ''}`
          : `× ${i.packageCount}`
      return `買い物 ${b?.name ?? '?'}: ${before} → ${after}`
    },
    apply: (db, id, i) => updateShoppingItem(db, need(id), i),
  }),
  'shopping.delete': def({
    tool: 'propose_shopping_delete',
    description: '買い物リストから行を消す案',
    target: 'shopping',
    input: null,
    summarize: (snap, id) => `買い物リストから削除: ${snap.shoppingById.get(id ?? '')?.name ?? '?'}`,
    apply: (db, id) => deleteShoppingItem(db, need(id)),
  }),
  'shopping.check': def({
    tool: 'propose_shopping_check',
    description: '買い物リストの行を「買った」にする案。在庫にも 1 行入る',
    target: 'shopping',
    input: null,
    summarize: (snap, id) => {
      const b = snap.shoppingById.get(id ?? '')
      return `買い物リストの${b?.name ?? '?'}をチェック ＋ 在庫に${b?.name ?? '?'} ${b ? `${fmt(b.buyQuantity)}${b.unit}` : ''}を追加`
    },
    apply: (db, id, _, today) => checkShoppingItem(db, need(id), today),
  }),
  'plan.create': def({
    tool: 'propose_plan_create',
    description: '献立を作る案（進行中の献立がないときだけ）。anchors は食べたい料理',
    target: null,
    input: planCreateSchema,
    summarize: (snap, _, i) =>
      `献立を作る: 食べたい料理 ${i.anchors.map((a) => `${snap.recipeTitle(a.recipeId)}${a.servings ? `（${a.servings}食）` : ''}`).join('、')}`,
    apply: (db, _, i) => createPlan(db, i),
  }),
  'plan.set_recipes': def({
    tool: 'propose_plan_set_recipes',
    description:
      '献立の料理・食数・食べる順を丸ごと置き換える案（献立が下書きのときだけ）。targetId は献立の id。食べたい料理は role=anchor、足した料理は role=added',
    target: 'plan',
    input: planRecipesInputSchema,
    summarize: (snap, _, i) => {
      const before = snap.plan?.recipes.map((r) => `${r.title}（${r.servings}食）`).join('、') || 'なし'
      const after = [...i.recipes]
        .sort((a, b) => a.dayIndex - b.dayIndex)
        .map((r) => `${snap.recipeTitle(r.recipeId)}（${r.servings}食）`)
        .join('、')
      return `献立の料理: ${before} → ${after}`
    },
    apply: (db, id, i) => replacePlanRecipes(db, need(id), i),
  }),
}

const OP_BY_TOOL = new Map(Object.entries(OPS).map(([op, d]) => [d.tool, op as AgentOp]))

/** エージェントに見せるデータ。購入日・袋・利用履歴は入れない（08「プライバシー」） */
async function buildSnapshot(db: Db, today: string) {
  // 各行の updated_at を先に読む（変更案の baseUpdatedAt に使う）。中身はこの後に読むので、
  // 間に変わった行は summary が新しく base が古くなり、反映のときに安全側（変わりました）で止まる
  const updatedAt = await readUpdatedAt(db)
  const [inventory, masters, recipeList, plan] = await Promise.all([
    listInventory(db, today),
    listIngredients(db),
    listRecipes(db),
    getCurrentPlan(db),
  ])
  const recipeDetails = await Promise.all(recipeList.map((r) => getRecipe(db, r.id)))
  const shopping = plan?.status === 'shopping' ? (await listShopping(db, plan.id)).items : []
  const titles = new Map(recipeList.map((r) => [r.id, r.title]))
  return {
    inventory,
    masters,
    recipeList,
    recipeDetails,
    plan,
    shopping,
    inventoryById: new Map(inventory.map((i) => [i.id, i])),
    ingredientsById: new Map(masters.map((m) => [m.id, m])),
    recipesById: new Map(recipeDetails.map((r) => [r.id, r])),
    shoppingById: new Map(shopping.map((s) => [s.id, s])),
    recipeTitle: (id: string) => titles.get(id) ?? '?',
    updatedAt,
  }
}

const key = (target: Target, id: string) => `${target}:${id}`

/** スナップショットを作る時点の updated_at（在庫は使い切っていない行、買い物は買い物中の献立の行だけ） */
async function readUpdatedAt(db: Db): Promise<Map<string, string>> {
  const pick = { id: inventoryItems.id, updatedAt: inventoryItems.updatedAt }
  const [inv, shop, rec, pl] = await Promise.all([
    db.select(pick).from(inventoryItems).where(isNull(inventoryItems.usedUpAt)),
    db
      .select({ id: shoppingItems.id, updatedAt: shoppingItems.updatedAt })
      .from(shoppingItems)
      .where(sql`${shoppingItems.planId} IN (SELECT ${plans.id} FROM ${plans} WHERE ${plans.status} = 'shopping')`),
    db.select({ id: recipes.id, updatedAt: recipes.updatedAt }).from(recipes).where(isNull(recipes.archivedAt)),
    db
      .select({ id: plans.id, updatedAt: plans.updatedAt })
      .from(plans)
      .where(sql`${plans.status} IN ('draft', 'shopping', 'prepping')`),
  ])
  const map = new Map<string, string>()
  for (const r of inv) map.set(key('inventory', r.id), r.updatedAt)
  for (const r of shop) map.set(key('shopping', r.id), r.updatedAt)
  for (const r of rec) map.set(key('recipe', r.id), r.updatedAt)
  for (const r of pl) map.set(key('plan', r.id), r.updatedAt)
  return map
}

function readTools(snap: Snapshot): AgentReadTool[] {
  return [
    {
      name: 'list_inventory',
      description: '今の在庫（使い切っていないもの）。量は基準単位。reservedQuantity は保存中の袋のために取ってある量',
      result: snap.inventory.map((i) => ({
        id: i.id,
        ingredientId: i.ingredientId,
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
        location: i.location,
        expiresOn: i.expiresOn,
        reservedQuantity: i.reservedQuantity,
      })),
    },
    {
      name: 'list_ingredients',
      description: '食材マスタ（名前、別名、基準単位、販売単位）。在庫やレシピの食材はここの id を使う',
      result: snap.masters.map((m) => ({
        id: m.id,
        name: m.name,
        aliases: m.aliases,
        unit: m.unit,
        gramsPerUnit: m.gramsPerUnit,
        packageUnits: m.packageUnits.map((p) => ({ id: p.id, label: p.label, quantity: p.quantity })),
      })),
    },
    {
      name: 'list_recipes',
      description: '登録済みのレシピの一覧（id、料理名、何人前か、材料名）',
      result: snap.recipeList.map((r) => ({
        id: r.id,
        title: r.title,
        servings: r.servings,
        ingredientNames: r.ingredientNames,
      })),
    },
    {
      name: 'get_recipe',
      description: 'レシピ 1 件の全部（材料と手順）。propose_recipe_update の前に読む',
      itemsById: Object.fromEntries(
        snap.recipeDetails.map((r) => [
          r.id,
          {
            title: r.title,
            servings: r.servings,
            caloriesKcal: r.caloriesKcal,
            hotcookMode: r.hotcookMode,
            maxServings1_6l: r.maxServings1_6l,
            packSeasonings: r.packSeasonings,
            notes: r.notes,
            ingredients: r.ingredients.map((i) => ({
              ingredientId: i.ingredientId,
              name: i.ingredientName,
              unit: i.unit,
              quantity: i.quantity,
              displayText: i.displayText,
              cutStyle: i.cutStyle,
              addOrder: i.addOrder,
            })),
            steps: r.steps.map((s) => ({ phase: s.phase, text: s.text })),
          },
        ]),
      ),
    },
    {
      name: 'get_current_plan',
      description:
        '進行中の献立（なければ null）。status: draft=料理を選び中、shopping=買い物中、prepping=下ごしらえ中',
      result: snap.plan && {
        id: snap.plan.id,
        status: snap.plan.status,
        startsOn: snap.plan.startsOn,
        recipes: snap.plan.recipes.map((r) => ({
          recipeId: r.recipeId,
          title: r.title,
          role: r.role,
          servings: r.servings,
          dayIndex: r.dayIndex,
        })),
      },
    },
    {
      name: 'list_shopping',
      description: '買い物リスト（献立が買い物中のときだけ。それ以外は空）',
      result: snap.shopping.map((s) => ({
        id: s.id,
        ingredientId: s.ingredientId,
        name: s.name,
        unit: s.unit,
        buyQuantity: s.buyQuantity,
        packageUnitId: s.packageUnitId,
        packageLabel: s.packageLabel,
        packageCount: s.packageCount,
        checked: s.checkedAt !== null,
        packageUnits: s.packageUnits,
      })),
    },
  ]
}

/** 道具の入力の JSON スキーマ（zod の入力側）。targetId と input だけ。summary や baseUpdatedAt は入れない */
function opTools(): AgentOpTool[] {
  return Object.values(OPS).map((d) => {
    const properties: Record<string, unknown> = {}
    const required: string[] = []
    if (d.target) {
      properties.targetId = { type: 'string', description: '変える行の id（読む道具の id）' }
      required.push('targetId')
    }
    if (d.input) {
      const { $schema: _, ...schema } = z.toJSONSchema(d.input, { io: 'input', unrepresentable: 'any' }) as Record<
        string,
        unknown
      >
      properties.input = schema
      required.push('input')
    }
    return { name: d.tool, description: d.description, inputSchema: { type: 'object', properties, required } }
  })
}

/** 対象の行の updated_at（なければ null） */
async function targetUpdatedAt(db: Db, target: Target, id: string): Promise<string | null> {
  const table = { inventory: inventoryItems, shopping: shoppingItems, recipe: recipes, plan: plans }[target]
  const row = await db.select({ updatedAt: table.updatedAt }).from(table).where(eq(table.id, id)).get()
  return row?.updatedAt ?? null
}

function targetExists(snap: Snapshot, target: Target, id: string): boolean {
  switch (target) {
    case 'inventory':
      return snap.inventoryById.has(id)
    case 'shopping':
      return snap.shoppingById.has(id)
    case 'recipe':
      return snap.recipesById.has(id)
    case 'plan':
      return snap.plan?.id === id
  }
}

/** 頼みを受けて変更案を作る。DB は変えない */
export async function requestAgent(
  db: Db,
  runner: AgentRunner,
  instruction: string,
  today: string,
): Promise<AgentResult> {
  const snap = await buildSnapshot(db, today)
  const { reply, calls } = await runner.run({
    instruction,
    prompt: `${AGENT_SYSTEM}\n\n## 今日\n${today}\n\n## 頼み\n${instruction}`,
    readTools: readTools(snap),
    opTools: opTools(),
  })

  const operations: AgentOperation[] = []
  const warnings: string[] = []
  /** 反映で updated_at が変わる対象。同じ対象への 2 つ目の案は反映で必ず失敗するので、ここで捨てる */
  const touched = new Set<string>()
  for (const call of calls.slice(0, 20)) {
    const op = OP_BY_TOOL.get(call.tool)
    const d = op && OPS[op]
    if (!op || !d) {
      warnings.push(`知らない道具の呼び出しを捨てました（${call.tool}）`)
      continue
    }
    const targetId = d.target && typeof call.args.targetId === 'string' ? call.args.targetId : null
    if (d.target && (!targetId || !targetExists(snap, d.target, targetId))) {
      warnings.push(`対象が見つからない変更案を捨てました（${op}）`)
      continue
    }
    let parsedInput: unknown
    if (d.input) {
      const parsed = d.input.safeParse(call.args.input)
      if (!parsed.success) {
        warnings.push(`形が正しくない変更案を捨てました（${op}: ${parsed.error.issues[0]?.message ?? ''}）`)
        continue
      }
      parsedInput = parsed.data
    }
    if (d.target && targetId && !d.keepsTarget) {
      if (touched.has(key(d.target, targetId))) {
        warnings.push(`同じ対象への 2 つ目の変更案を捨てました（${op}。1 つにまとめてもう一度頼んでください）`)
        continue
      }
      touched.add(key(d.target, targetId))
    }
    operations.push({
      op,
      targetId,
      // 画面に返して反映のときにもう一度検証するので、検証前の形（AI の入力そのまま）を持たせる
      input: d.input ? call.args.input : null,
      summary: d.summarize(snap, targetId, parsedInput as never),
      // スナップショットを作った時点の値（エージェントの実行後に読み直さない）
      baseUpdatedAt: d.target && targetId ? (snap.updatedAt.get(key(d.target, targetId)) ?? null) : null,
    })
  }
  return { reply, operations, warnings }
}

/** 本人が選んだ変更案を上から順に反映する。1 件ずつ成否を返し、失敗してもほかは続ける */
export async function applyOperations(db: Db, input: AgentApplyInput, today: string): Promise<AgentApplyResult> {
  const results: AgentApplyResult['results'] = []
  for (const o of input.operations) {
    const d = OPS[o.op]
    try {
      if (d.target) {
        if (!o.targetId) throw new ApiError(400, 'BAD_REQUEST', '対象がありません')
        const current = await targetUpdatedAt(db, d.target, o.targetId)
        if (current === null) throw new ApiError(404, 'NOT_FOUND', '対象が見つかりません')
        if (current !== o.baseUpdatedAt) {
          throw new ApiError(409, 'STALE', '画面を開いた後に変わりました。もう一度頼んでください')
        }
      }
      let value: unknown = null
      if (d.input) {
        const parsed = d.input.safeParse(o.input)
        if (!parsed.success)
          throw new ApiError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? '形が正しくありません')
        value = parsed.data
      }
      await d.apply(db, o.targetId, value as never, today)
      results.push({ ok: true })
    } catch (err) {
      results.push({ ok: false, error: err instanceof ApiError ? err.message : '反映できませんでした' })
    }
  }
  return { results }
}
