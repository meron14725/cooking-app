/** MVP では設定画面を作らず、ここの定数で運用する（docs/design/02-data-model.md） */

/** 1 回の献立の品数 */
export const TARGET_RECIPE_COUNT = 3

/** 期限まで何日以内なら「期限が近い」とするか */
export const EXPIRING_SOON_DAYS = 2

/** 献立に入れる料理の既定の食数 */
export const DEFAULT_SERVINGS = 1

/** 切った後の日持ちがマスタにないときの上限（日） */
export const DEFAULT_PREPPED_FRIDGE_DAYS = 2
export const DEFAULT_PREPPED_FREEZER_DAYS = 21

/** 冷凍の日持ちがマスタにないとき（冷凍できる食材）の目安（日） */
export const DEFAULT_FREEZER_DAYS = 30

/** 1 回の提案の最大件数 */
export const MAX_PROPOSALS = 3

/** レコメンドのスコアの重み（docs/design/05-recommendation.md。実際に使って調整する） */
export const SCORE_WEIGHTS = {
  /** 傷みやすさ: 常温で日持ちする / 冷凍できる / 冷蔵のみ */
  perishability: { pantry: 0.1, freezable: 0.3, fridgeOnly: 1.0 },
  /** 常温で日持ちするとみなす pantry_days */
  pantryStableDays: 30,
  /** 在庫を使ったボーナス（代表量あたり） */
  inventoryBonus: 0.5,
  /** 期限間近の在庫を使ったときのボーナスの倍率 */
  expiringBonusMultiplier: 1.5,
  /** 期限間近の在庫を使い残したペナルティ（代表量あたり） */
  expiringUnusedPenalty: 1.5,
  /** 買い物 1 点あたり */
  perShoppingItem: 0.1,
  /** 販売単位がない g の食材の代表量 */
  gramsRepresentative: 100,
  /** 最良案でも冷蔵のみの食材がこのパック数以上余るなら AI 補完をすすめる */
  aiSuggestionLeftoverPacks: 0.5,
} as const
