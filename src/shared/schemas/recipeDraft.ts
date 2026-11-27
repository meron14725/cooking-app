import { z } from 'zod'
import { stepPhaseSchema } from './recipe'

/**
 * AI の生の出力（docs/design/04-api.md「単位の扱い」）。
 * JSON スキーマとしてプロバイダに渡すので、プロバイダが扱いやすいよう null 許容と必須だけで書く。
 */
export const recipeDraftRawSchema = z.object({
  title: z.string().min(1).max(100),
  /** 材料の量が何人前か */
  servings: z.number().positive().max(20),
  /** 元のレシピにあれば 1 人前のカロリー */
  caloriesKcal: z.number().int().min(0).max(5000).nullable(),
  /** ホットクックの設定。例: 手動 > 煮物を作る > まぜる > 20分 */
  hotcookMode: z.string().max(100).nullable(),
  maxServings1_6l: z.number().positive().max(20).nullable(),
  ingredients: z
    .array(
      z.object({
        /** 元の表記。例: 玉ねぎ 1/2個 */
        displayText: z.string().min(1).max(100),
        /** 食材マスタの名前に寄せた名前。マスタになければ新しい候補名 */
        name: z.string().min(1).max(50),
        /** 少々・適量なら null */
        quantity: z.number().min(0).nullable(),
        /** quantity の単位。マスタの基準単位に直せたらその単位 */
        unit: z.string().max(20).nullable(),
        cutStyle: z.string().max(50).nullable(),
      }),
    )
    .min(1)
    .max(50),
  steps: z.array(z.object({ phase: stepPhaseSchema, text: z.string().min(1).max(500) })).max(50),
  warnings: z.array(z.string().max(200)).max(20),
})

export type RecipeDraftRaw = z.infer<typeof recipeDraftRawSchema>

export const calorieEstimateSchema = z.object({ caloriesKcal: z.number().int().min(0).max(5000) })

/** 画面で確認・修正してから POST /api/recipes で保存する下書き */
export type RecipeDraft = {
  title: string
  servings: number
  caloriesKcal: number | null
  hotcookMode: string | null
  sourceUrl: string | null
  /** URL 取り込みなら url、補完提案なら ai */
  sourceType: 'url' | 'ai'
  ingredients: {
    displayText: string
    /** マスタと照合できたもの */
    ingredientId: string | null
    /** 照合できないときの新規マスタ候補 */
    suggestedName: string
    /** 照合できないときの単位（新しくマスタに足すときの基準単位の候補）。照合できたら null */
    suggestedUnit: string | null
    /** 照合できたらマスタの基準単位に換算済み（換算できなければ null）。照合できなければ suggestedUnit での量 */
    quantity: number | null
    cutStyle: string | null
  }[]
  steps: { phase: 'prep' | 'cook'; text: string }[]
  maxServings1_6l: number | null
  warnings: string[]
  /** 公式レシピ（COCORO KITCHEN）から取り込んだときだけ入る。ほかは null */
  official: RecipeDraftOfficial | null
}

/** 公式レシピの API から取った情報。保存時に Recipe の同名の欄に入る */
export type RecipeDraftOfficial = {
  officialMenuNo: string | null
  imageKey: string | null
  favoriteCount: number | null
  cookCount: number | null
  score: number | null
  /** 取り込み元の調理時間（分）。読めなければ null */
  cookMinutes: number | null
  /** まぜ技ユニットを使うか。取り込み元になければ null */
  usesMixingUnit: boolean | null
}

/** 「＋」のパネル: URL・メモ・料理名など何でも。URL を含めばそのページから、なければ文から下書きを作る */
export const draftInputSchema = z.object({
  text: z.string().trim().min(1, '送る内容を入れてください').max(4000, '4000 文字までにしてください'),
})
export type DraftInput = z.infer<typeof draftInputSchema>

/**
 * 文の中の最初の http(s) の URL と、それ以外の文（メモ）。
 * URL は URL に使える ASCII 文字だけを拾い（すぐ後ろの日本語は含めない）、末尾の句読点は落とす。
 * メモは行ごとに空白を詰め、改行は残す
 */
export function splitUrl(text: string): { url: string | null; memo: string } {
  const m = text.match(/https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&*+,;=%]+/)
  const url = m?.[0].replace(/[.,!?:;]+$/, '')
  if (!url) return { url: null, memo: text.trim() }
  const memo = text
    .replace(url, ' ')
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
  return { url, memo }
}

/** 補完提案: 余りそうな食材（レコメンドの余り。冷蔵のみのものを先に） */
export const suggestRecipeInputSchema = z.object({
  leftovers: z
    .array(z.object({ ingredientId: z.string().min(1), quantity: z.number().positive().max(100000) }))
    .min(1, '余る食材がありません')
    .max(30),
})
export type SuggestRecipeInput = z.infer<typeof suggestRecipeInputSchema>

export const estimateCaloriesInputSchema = z.object({
  servings: z.number().positive().max(20),
  ingredients: z
    .array(z.object({ displayText: z.string().trim().min(1).max(100) }))
    .min(1, '材料を 1 つ以上入れてください')
    .max(50),
})
export type EstimateCaloriesInput = z.infer<typeof estimateCaloriesInputSchema>
