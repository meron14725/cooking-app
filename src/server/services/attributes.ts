/**
 * 「まとめて推定」（docs/design/09-recommendation-v2.md「区分・系統の推定」「食材マスタの手直し」）。
 * 段ごとに、ルールで決めてから、決まらなかったものだけを limit 件ずつ AI に聞く。
 * 1 回の呼び出しでは、AI に聞く必要が残っている最初の段だけ AI を使う（画面は remaining が 0 になるまで呼び続ける）。
 * 段の順: 食材の分類・重さ → 食材の日持ち（docs/design/11-storage-days.md。分類ごとの辞書を使うため）
 * → 食材の価格（docs/design/10-cost.md。g 換算を使うため）→ レシピの区分・系統（区分の判定に食材の分類を使うため）
 */
import { and, asc, eq, isNull, lt, or } from 'drizzle-orm'
import { PRICE_STALE_DAYS } from '../../shared/domain/constants'
import { representativeLabel } from '../../shared/domain/cost'
import { fixIngredientByRule } from '../../shared/domain/ingredientAttributes'
import { priceByRule } from '../../shared/domain/priceRules'
import { deriveAttributes } from '../../shared/domain/recipeAttributes'
import { validSourceUrls } from '../../shared/domain/sources'
import { type StorageValues, storageByRule, validStorage } from '../../shared/domain/storageRules'
import type { EstimateAttributesResponse, StageProgress } from '../../shared/schemas/attributes'
import type { AiProvider } from '../ai/provider'
import type { Db } from '../db/client'
import { ingredients, packageUnits, recipeIngredients, recipes } from '../db/schema'

/** D1 の batch 1 回に入れる文の数 */
const BATCH_CHUNK = 50

async function runInChunks(db: Db, statements: Parameters<Db['batch']>[0][number][]) {
  for (let i = 0; i < statements.length; i += BATCH_CHUNK) {
    const chunk = statements.slice(i, i + BATCH_CHUNK)
    if (chunk.length > 0) await db.batch(chunk as unknown as Parameters<Db['batch']>[0])
  }
}

// ---------- 食材 ----------

/** attributes_source が NULL（取り込みのまま）の食材を直す */
async function ingredientStage(
  db: Db,
  ai: () => AiProvider,
  limit: number,
  useAi: boolean,
  webSearch: boolean,
): Promise<StageProgress> {
  const rows = await db
    .select({
      id: ingredients.id,
      name: ingredients.name,
      category: ingredients.category,
      unit: ingredients.unit,
      gramsPerUnit: ingredients.gramsPerUnit,
    })
    .from(ingredients)
    .where(isNull(ingredients.attributesSource))
    .orderBy(asc(ingredients.name))

  const updates: Parameters<Db['batch']>[0][number][] = []
  const pending: { row: (typeof rows)[number]; categoryFromAi: boolean; needsGrams: boolean }[] = []
  for (const row of rows) {
    const fixed = fixIngredientByRule(row)
    if (!fixed.needsAi) {
      updates.push(
        db
          .update(ingredients)
          .set({ category: fixed.category, attributesSource: 'rule' })
          .where(eq(ingredients.id, row.id)),
      )
      continue
    }
    // 名前で分類が決まったものは、その分類を先に入れておく（AI には重さだけ聞く）
    if (fixed.category !== row.category) row.category = fixed.category
    pending.push({
      row,
      // 名前で分類が決まった食材（玉ねぎなど）は、重さだけ聞き、分類は AI の答えで変えない
      categoryFromAi: fixed.needsCategory,
      needsGrams: row.unit !== 'g' && row.unit !== 'ml' && row.gramsPerUnit === null,
    })
  }
  await runInChunks(db, updates)
  if (!useAi || pending.length === 0) return { updated: updates.length, remaining: pending.length }

  const batch = pending.slice(0, limit)
  const result = await ai().classifyIngredients(
    batch.map((p) => ({ key: p.row.id, name: p.row.name, unit: p.row.unit, needsGrams: p.needsGrams })),
    { webSearch },
  )
  const byKey = new Map(result.items.map((i) => [i.key, i]))
  // AI が答えなかった食材も ai にする（同じ食材を何度も聞かないため）。分類は今の値のまま
  await runInChunks(
    db,
    batch.map((p) => {
      const answer = byKey.get(p.row.id)
      return db
        .update(ingredients)
        .set({
          category: p.categoryFromAi && answer ? answer.category : p.row.category,
          gramsPerUnit: p.needsGrams ? (answer?.gramsPerUnit ?? null) : p.row.gramsPerUnit,
          attributesSource: 'ai',
        })
        .where(eq(ingredients.id, p.row.id))
    }),
  )
  return { updated: updates.length + batch.length, remaining: pending.length - batch.length }
}

// ---------- 日持ち ----------

/**
 * storage_source が NULL（取り込みのまま）の食材の日持ちと保存場所を、辞書で決め、決まらなければ AI に聞く。
 * AI の答えが範囲外・矛盾していれば今の値を残し、ai にする（同じ食材を何度も聞かない。分類の段と同じ）。
 * ウェブで調べたとき（webSearch）は、出典 URL のない答えも同じく捨て、出典を storage_source_urls に残す
 */
async function storageStage(
  db: Db,
  ai: () => AiProvider,
  limit: number,
  useAi: boolean,
  webSearch: boolean,
): Promise<StageProgress> {
  const rows = await db
    .select({
      id: ingredients.id,
      name: ingredients.name,
      aliases: ingredients.aliases,
      category: ingredients.category,
      attributesSource: ingredients.attributesSource,
    })
    .from(ingredients)
    .where(and(isNull(ingredients.archivedAt), isNull(ingredients.storageSource)))
    .orderBy(asc(ingredients.name))
  if (rows.length === 0) return { updated: 0, remaining: 0 }
  // 分類がまだ取り込みのまま（分類の段の AI 待ち）の食材は、分類が決まってから見る（辞書は分類ごとに引くため）
  const unsettled = rows.filter((r) => r.attributesSource === null).length

  // 推定中に画面で直された値（manual）は上書きしない
  const save = (id: string, values: StorageValues | null, source: 'rule' | 'ai', urls: string[] = []) =>
    db
      .update(ingredients)
      .set({ ...(values ?? {}), storageSource: source, storageSourceUrls: values ? urls : [] })
      .where(and(eq(ingredients.id, id), isNull(ingredients.storageSource)))

  const updates: Parameters<Db['batch']>[0][number][] = []
  const pending: typeof rows = []
  for (const row of rows) {
    if (row.attributesSource === null) continue
    const values = storageByRule(row)
    if (values) updates.push(save(row.id, values, 'rule'))
    else pending.push(row)
  }
  await runInChunks(db, updates)
  if (!useAi || pending.length === 0) return { updated: updates.length, remaining: pending.length + unsettled }

  const batch = pending.slice(0, limit)
  const result = await ai().estimateStorage(
    batch.map((p) => ({ key: p.id, name: p.name, category: p.category })),
    { webSearch },
  )
  const byKey = new Map(result.items.map((i) => [i.key, i]))
  await runInChunks(
    db,
    batch.map((p) => {
      const answer = byKey.get(p.id)
      const urls = webSearch ? validSourceUrls(answer?.sources) : []
      // 調べたのに出典がなければ、答えなしと同じ（今の値を残す）
      const values = webSearch && urls.length === 0 ? null : validStorage(answer)
      return save(p.id, values, 'ai', urls)
    }),
  )
  return { updated: updates.length + batch.length, remaining: pending.length - batch.length + unsettled }
}

// ---------- 価格 ----------

/** AI の答えで保存してよい価格（円）の範囲 */
const AI_PRICE_MIN_YEN = 1
const AI_PRICE_MAX_YEN = 20_000

/**
 * 価格の段の対象: 削除されていない、常備品でない、価格が未設定の食材のうち、まだ推定していないもの。
 * AI が答えられなかった食材は price_yen を NULL のまま price_updated_at だけ入れ、次からは聞かない
 */
const priceTarget = () =>
  and(
    isNull(ingredients.archivedAt),
    eq(ingredients.isStaple, false),
    isNull(ingredients.priceYen),
    isNull(ingredients.priceUpdatedAt),
  )

/** 推定中に手で直された値を上書きしない */
const notManual = () => or(isNull(ingredients.priceSource), eq(ingredients.priceSource, 'default'))

/**
 * 365 日より前に入れた目安（default）と、365 日より前に AI が答えられなかった印を、未設定に戻す。
 * 手で入れた価格（manual）は触らない
 */
async function resetStalePrices(db: Db, now: Date) {
  const cutoff = new Date(now.getTime() - PRICE_STALE_DAYS * 24 * 60 * 60 * 1000).toISOString()
  await db
    .update(ingredients)
    .set({ priceYen: null, priceSource: null, priceUpdatedAt: null, priceSourceUrls: [] })
    .where(
      and(
        lt(ingredients.priceUpdatedAt, cutoff),
        or(eq(ingredients.priceSource, 'default'), and(isNull(ingredients.priceSource), isNull(ingredients.priceYen))),
      ),
    )
}

/** ウェブで調べたとき（webSearch）は、出典 URL のない答えを捨て、出典を price_source_urls に残す */
async function priceStage(
  db: Db,
  ai: () => AiProvider,
  limit: number,
  useAi: boolean,
  webSearch: boolean,
): Promise<StageProgress> {
  const target = priceTarget()
  const rows = await db
    .select({
      id: ingredients.id,
      name: ingredients.name,
      aliases: ingredients.aliases,
      unit: ingredients.unit,
      gramsPerUnit: ingredients.gramsPerUnit,
    })
    .from(ingredients)
    .where(target)
    .orderBy(asc(ingredients.name))
  if (rows.length === 0) return { updated: 0, remaining: 0 }

  // ID を IN に並べず、同じ条件で JOIN して販売単位を取る（D1 の変数の上限）
  const units = await db
    .select({
      ingredientId: packageUnits.ingredientId,
      label: packageUnits.label,
      quantity: packageUnits.quantity,
      isDefault: packageUnits.isDefault,
    })
    .from(packageUnits)
    .innerJoin(ingredients, eq(ingredients.id, packageUnits.ingredientId))
    .where(priceTarget())
    .orderBy(asc(packageUnits.createdAt), asc(packageUnits.id))
  const unitsByIngredient = new Map<string, typeof units>()
  for (const u of units) {
    const list = unitsByIngredient.get(u.ingredientId) ?? []
    list.push(u)
    unitsByIngredient.set(u.ingredientId, list)
  }

  const now = new Date().toISOString()
  const save = (id: string, priceYen: number | null, urls: string[] = []) =>
    db
      .update(ingredients)
      .set({
        priceYen,
        priceSource: priceYen === null ? null : 'default',
        priceUpdatedAt: now,
        priceSourceUrls: priceYen === null ? [] : urls,
      })
      .where(and(eq(ingredients.id, id), isNull(ingredients.priceYen), notManual()))

  const updates: Parameters<Db['batch']>[0][number][] = []
  const pending: { id: string; name: string; unit: string; basis: string }[] = []
  for (const row of rows) {
    const ing = { ...row, packageUnits: unitsByIngredient.get(row.id) ?? [] }
    const price = priceByRule(ing)
    if (price !== null) updates.push(save(row.id, price))
    else pending.push({ id: row.id, name: row.name, unit: row.unit, basis: representativeLabel(ing) })
  }
  await runInChunks(db, updates)
  if (!useAi || pending.length === 0) return { updated: updates.length, remaining: pending.length }

  const batch = pending.slice(0, limit)
  const result = await ai().estimatePrices(
    batch.map((p) => ({ key: p.id, name: p.name, unit: p.unit, basis: p.basis })),
    { webSearch },
  )
  const byKey = new Map(result.items.map((i) => [i.key, i]))
  // 答えがない・範囲外・整数でない答え・（調べたのに）出典のない答えは捨て、未設定のまま印だけ付ける（同じ食材を何度も聞かない）
  await runInChunks(
    db,
    batch.map((p) => {
      const item = byKey.get(p.id)
      const answer = item?.priceYen
      const urls = webSearch ? validSourceUrls(item?.sources) : []
      const ok =
        typeof answer === 'number' &&
        Number.isInteger(answer) &&
        answer >= AI_PRICE_MIN_YEN &&
        answer <= AI_PRICE_MAX_YEN &&
        (!webSearch || urls.length > 0)
      return save(p.id, ok ? answer : null, urls)
    }),
  )
  return { updated: updates.length + batch.length, remaining: pending.length - batch.length }
}

// ---------- レシピ ----------

/**
 * 手で直したもの（manual）と AI で決めたもの（ai）以外のレシピを、ルールで決め直す。
 * そのあと区分か系統が決まらなかったものを AI に聞く
 */
async function recipeStage(db: Db, ai: () => AiProvider, limit: number, useAi: boolean): Promise<StageProgress> {
  const target = and(
    isNull(recipes.archivedAt),
    or(isNull(recipes.attributesSource), eq(recipes.attributesSource, 'rule')),
  )
  const rows = await db
    .select({
      id: recipes.id,
      title: recipes.title,
      servings: recipes.servings,
      hotcookMode: recipes.hotcookMode,
      dishType: recipes.dishType,
      cuisine: recipes.cuisine,
      usesMixingUnit: recipes.usesMixingUnit,
      cookMinutes: recipes.cookMinutes,
      attributesSource: recipes.attributesSource,
    })
    .from(recipes)
    .where(target)
    .orderBy(asc(recipes.title))
  if (rows.length === 0) return { updated: 0, remaining: 0 }

  // ID を IN に並べると D1 の変数の上限（100）を超えるので、同じ条件で recipes と JOIN して取る
  const parts = await db
    .select({
      recipeId: recipeIngredients.recipeId,
      quantity: recipeIngredients.quantity,
      name: ingredients.name,
      category: ingredients.category,
      unit: ingredients.unit,
      gramsPerUnit: ingredients.gramsPerUnit,
      isStaple: ingredients.isStaple,
    })
    .from(recipeIngredients)
    .innerJoin(recipes, eq(recipes.id, recipeIngredients.recipeId))
    .innerJoin(ingredients, eq(ingredients.id, recipeIngredients.ingredientId))
    .where(target)
  const partsByRecipe = new Map<string, typeof parts>()
  for (const p of parts) {
    const list = partsByRecipe.get(p.recipeId) ?? []
    list.push(p)
    partsByRecipe.set(p.recipeId, list)
  }

  const updates: Parameters<Db['batch']>[0][number][] = []
  const pending: { id: string; title: string; ingredientNames: string[]; dishType: unknown; cuisine: unknown }[] = []
  for (const row of rows) {
    const list = partsByRecipe.get(row.id) ?? []
    // 取り込み元の値（まぜ技・調理時間）は残す。区分・系統はルールで決め直す
    const derived = deriveAttributes(
      { title: row.title, servings: row.servings, hotcookMode: row.hotcookMode, ingredients: list },
      { usesMixingUnit: row.usesMixingUnit, cookMinutes: row.cookMinutes },
    )
    const changed =
      row.attributesSource !== 'rule' ||
      derived.dishType !== row.dishType ||
      derived.cuisine !== row.cuisine ||
      derived.usesMixingUnit !== row.usesMixingUnit ||
      derived.cookMinutes !== row.cookMinutes
    if (changed) {
      updates.push(
        db
          .update(recipes)
          .set({ ...derived, attributesSource: 'rule' })
          .where(eq(recipes.id, row.id)),
      )
    }
    if (derived.dishType === null || derived.cuisine === null) {
      pending.push({
        id: row.id,
        title: row.title,
        ingredientNames: [...new Set(list.filter((p) => !p.isStaple).map((p) => p.name))],
        dishType: derived.dishType,
        cuisine: derived.cuisine,
      })
    }
  }
  await runInChunks(db, updates)
  if (!useAi || pending.length === 0) return { updated: updates.length, remaining: pending.length }

  const batch = pending.slice(0, limit)
  const result = await ai().classifyRecipes(
    batch.map((p) => ({ key: p.id, title: p.title, ingredientNames: p.ingredientNames })),
  )
  const byKey = new Map(result.items.map((i) => [i.key, i]))
  // ルールで決まった欄は残し、決まらなかった欄だけ AI の答えを入れる。答えがなくても ai にする（何度も聞かない）
  await runInChunks(
    db,
    batch.map((p) => {
      const answer = byKey.get(p.id)
      return db
        .update(recipes)
        .set({
          ...(p.dishType === null ? { dishType: answer?.dishType ?? null } : {}),
          ...(p.cuisine === null ? { cuisine: answer?.cuisine ?? null } : {}),
          attributesSource: 'ai',
        })
        .where(eq(recipes.id, p.id))
    }),
  )
  return { updated: updates.length + batch.length, remaining: pending.length - batch.length }
}

// ---------- まとめて ----------

/**
 * ai は AI を使うときだけ呼ぶ（ルールだけで済むときは AI の設定がなくても動く）
 */
export async function estimateAttributes(
  db: Db,
  ai: () => AiProvider,
  input: { limit: number; refreshStalePrices: boolean; webSearch?: boolean },
): Promise<EstimateAttributesResponse> {
  const { limit } = input
  const webSearch = input.webSearch === true
  if (input.refreshStalePrices) await resetStalePrices(db, new Date())
  const ingredientProgress = await ingredientStage(db, ai, limit, true, webSearch)
  // 前の段の AI が残っているあいだは、後の段はルールだけで進めて数える
  // （日持ちの辞書は分類を、価格は g 換算を、レシピの区分は食材の分類を使うため）
  const storageProgress = await storageStage(db, ai, limit, ingredientProgress.remaining === 0, webSearch)
  const priceProgress = await priceStage(
    db,
    ai,
    limit,
    ingredientProgress.remaining === 0 && storageProgress.remaining === 0,
    webSearch,
  )
  const recipeProgress = await recipeStage(
    db,
    ai,
    limit,
    ingredientProgress.remaining === 0 && storageProgress.remaining === 0 && priceProgress.remaining === 0,
  )
  return { ingredients: ingredientProgress, storage: storageProgress, prices: priceProgress, recipes: recipeProgress }
}
