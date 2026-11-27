/** MVP では設定画面を作らず、ここの定数で運用する（docs/design/02-data-model.md） */

/** 1 回の献立の品数 */
export const TARGET_RECIPE_COUNT = 3

/** 期限まで何日以内なら「期限が近い」とするか */
export const EXPIRING_SOON_DAYS = 2

/** 献立に入れる料理の既定の食数（2 人で 1 回分） */
export const DEFAULT_SERVINGS = 2

/** 食数を ＋－ で変えるときの刻み（2 人で食べる前提で 2。1 にも戻せる） */
export const SERVINGS_STEP = 2

/** 1 品あたりの食数の上限（1.6L で作れる量。KN-HW16G は 2〜4 人用） */
export const MAX_SERVINGS_PER_DISH = 4

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

/** 1 食あたりに足す調味料・常備品の目安（円）。常備品は買い物の合計には入れない（docs/design/10-cost.md） */
export const STAPLE_COST_PER_MEAL_YEN = 20

/** この日数より前に入れた価格は「古い」と出す */
export const PRICE_STALE_DAYS = 365

/** 食材の価格（代表量あたり）の上限（円） */
export const MAX_PRICE_YEN = 100_000

// ---------- 提案 v2（docs/design/09-recommendation-v2.md） ----------

/** 合計◯食の既定（2 人 × 3 日）。前回の献立の値があればそちら */
export const DEFAULT_TARGET_MEALS = 6
/** 合計◯食の上限（1 品 4 食 × 4 品） */
export const MAX_TARGET_MEALS = 16
/** 1 回の献立の品数の上限（1 品 = 1 日） */
export const MAX_DISHES = 4
/** 調理時間が分からない料理の目安（分） */
export const DEFAULT_COOK_MINUTES = 30
/** 同じ料理をこの食数までは食べ続けても減点しない */
export const REPEAT_FREE_SERVINGS = 2
/** 1 食あたりのカロリーの目標の範囲（kcal） */
export const KCAL_PER_MEAL = { min: 450, max: 800 } as const
/** 1 食あたりの野菜の目標（g。1 日 350g の 1/3 の目安） */
export const VEGETABLE_G_PER_MEAL = 120
/** 追加の品数ごとに、組み合わせに使う候補の数（単品の点数の良い順に上から） */
export const CANDIDATES_BY_ADD_COUNT: Record<number, number> = { 1: 30, 2: 20, 3: 10 }
/** 1 回の提案で評価する組み合わせ × 食数の配り方の上限 */
export const MAX_EVALUATIONS = 4000
/**
 * 候補の枠（単品の点数で並べた中から、枠ごとに上位を取って合わせる）。
 * 「別の案を出す」の回ごとに件数を growth 倍に広げ、合わせて max 件まで
 */
export const CANDIDATE_POOL = {
  /** 単品の点数が良い（食材の使い回し・在庫） */
  score: 20,
  /** 期限間近の在庫を使う */
  expiring: 5,
  /** 人気 */
  popular: 5,
  /** base にない区分（主菜・副菜・汁物）ごとの上位 */
  perMissingType: 5,
  /** 主な食材が候補に少ないもの */
  rareMain: 5,
  max: 60,
  growth: 1.5,
} as const
/** 多様性: 選ぶ値 = 点数 + λ × 選んだ案・前に出した案との似ている度合いの最大（0 で点数順そのまま） */
export const DIVERSITY_LAMBDA = 1.0
/** 似ている度合い（0〜1）の重み。足して 1 */
export const SIMILARITY_WEIGHTS = {
  /** 追加した料理の重なり */
  recipes: 0.35,
  /** 追加した料理の主な食材の重なり */
  mainIngredient: 0.2,
  /** 追加した主菜の系統が同じ */
  mainCuisine: 0.15,
  /** 加熱のモードの重なり */
  heatMode: 0.1,
  /** まぜ技を使う品数が同じ */
  mixing: 0.05,
  /** 食数の配り方（大きい順に並べた形）が同じ */
  shape: 0.15,
} as const
/** 多様性を見て選ぶとき、点数の良い順に何案まで比べるか */
export const DIVERSITY_CANDIDATES = 300
/** 前に出した案のうち、似ている度合いを比べる新しいほうからの件数（それより前は除くだけ） */
export const DIVERSITY_RECENT_EXCLUDES = 12

/**
 * 提案 v2 の点数の重み（小さいほど良い点数に足す。popularity だけは引く）。
 * 単位は「パック 1 個分のムダ」くらいにそろえてある。実際に使って調整する（npm run rec:try で確かめる）
 */
export const RECOMMEND_WEIGHTS = {
  /** 1 食あたりのカロリーが目標の範囲から 100kcal 外れるごと */
  calorie: 0.3,
  /** 1 食あたりの野菜が目標に 50g 足りないごと */
  vegetable: 0.3,
  /** 調理時間の合計 60 分ごと */
  time: 0.2,
  /** ホットクックを 1 回回すごと */
  hotcook: 0.1,
  /** 同じ料理を REPEAT_FREE_SERVINGS を超えて食べる 1 食ごと */
  repeat: 0.3,
  /** 区分の偏り（主菜が少ない・汁物やその他ばかり）1 つごと */
  typeBalance: 0.5,
  /** 案の中で主な食材や系統が重なる 1 つごと */
  inPlanSimilarity: 0.2,
  /** 食べたい料理の食数が、選んだときの食数から 1 食ずれるごと */
  wantDeviation: 0.1,
  /** 追加した料理の人気（0〜1）。いちばん人気の料理で −0.5 */
  popularity: 0.5,
}
export type RecommendWeights = typeof RECOMMEND_WEIGHTS
