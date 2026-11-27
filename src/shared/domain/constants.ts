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
