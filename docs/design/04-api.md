# 04. API

Hono で `/api/*` に REST API を置きます。入出力は JSON、検証は `src/shared/schemas` の zod スキーマで行い、画面側も同じ型を使います。

## 共通

- 認証: Cloudflare Access の JWT（`Cf-Access-Jwt-Assertion`）をミドルウェアで検証
- エラー形式: `{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": ... } }`
- 主なステータス: 200 / 201 / 204 / 400（検証）/ 404 / 409（状態が合わない。例: 確定済みの献立を編集）/ 502（AI 側の失敗）
- 一覧は件数が少ない前提でページングなし（レシピが数百件を超えたら追加）

## 食材マスタ

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/api/ingredients` | 一覧（`?q=` で名前・別名を検索、`?category=`）。`{ items }` |
| POST | `/api/ingredients` | 作成（販売単位を含めて作る） |
| GET | `/api/ingredients/:id` | 詳細（販売単位を含む） |
| PUT | `/api/ingredients/:id` | 丸ごと更新。販売単位は `id` があれば更新、なければ追加、送らなかったものは削除 |
| DELETE | `/api/ingredients/:id` | 論理削除（204） |

- 代表の販売単位（`isDefault`）は食材ごとにちょうど 1 つ。2 つ指定すると 400、指定がなければ先頭を代表にする
- 名前は重複できない（409 `DUPLICATE_NAME`）。ただし作成（POST）で同じ名前の削除済み食材があれば、その行を復活させて入力値で上書きし、販売単位も入力どおりに置き換える（id が変わらないので、過去のレシピや在庫の参照も生きたまま戻る）。更新（PUT）で削除済み食材と同じ名前にするのは 409
- 画面では食材と販売単位を 1 つのフォームで編集するので、販売単位だけの API は持たない

## レシピ

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/api/recipes` | 一覧（`?q=`、`?ingredientId=` でその食材を使うレシピ） |
| POST | `/api/recipes` | 作成（材料・手順をまとめて送る） |
| GET | `/api/recipes/:id` | 詳細 |
| PUT | `/api/recipes/:id` | 更新（材料・手順は丸ごと置き換え） |
| DELETE | `/api/recipes/:id` | 論理削除 |
| POST | `/api/recipes/import-url` | URL から下書きを作る（保存しない） |
| POST | `/api/recipes/suggest` | AI に補完レシピの下書きを作らせる（保存しない） |
| POST | `/api/recipes/estimate-calories` | 材料と人数から 1 人前のカロリーを AI で推定（保存しない）。`{ caloriesKcal }` を返す |

- 材料の `ingredientId` は食材マスタにあるもの。ない、または削除済み（このレシピですでに使っているものを除く）なら 400 `UNKNOWN_INGREDIENT`
- 更新は材料・手順を丸ごと置き換える。作成元（`sourceType`）は作成時のまま変えない
- 初期データのレシピは `sourceType = seed`、id は `seed-recipe-<key>` で固定（`migrations/0002_seed_recipes.sql`）

`import-url` / `suggest` は `RecipeDraft` を返します。本人が画面で確認・修正し、`POST /api/recipes` で保存します。

```ts
// RecipeDraft（抜粋）
{
  title: string
  servings: number
  caloriesKcal: number | null
  hotcookMode: string | null
  sourceUrl: string | null
  ingredients: {
    displayText: string          // 「玉ねぎ 1/2個」
    ingredientId: string | null  // マスタと照合できたもの
    suggestedName: string        // 照合できないときの新規マスタ候補
    quantity: number | null      // マスタの基準単位に換算済み。換算できなければ null
    cutStyle: string | null
  }[]
  steps: { phase: 'prep' | 'cook', text: string }[]
  maxServings1_6l: number | null // AI の推定
  warnings: string[]             // 「1.6Lを超える可能性」「にんじん 100g の単位を確認してください」など
}
```

**単位の扱い**: AI の生の出力（`RecipeDraftRaw`）は `quantity` と `unit` を持ちます。サーバ側で `shared/domain/units.ts` を使って次のように正規化してから RecipeDraft にします。

- `unit` がマスタの基準単位と同じ → そのまま
- 基準単位が個・本・枚などで `unit = g` → `grams_per_unit` があれば `g / grams_per_unit` に換算
- それ以外 → `quantity = null` にし、`warnings` に「単位を確認してください」を追加

保存（`POST /api/recipes`、`PUT /api/recipes/:id`）は `unit` を受け取らず、`quantity` は常にマスタの基準単位として扱います。

## 在庫・冷蔵庫ビュー

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/api/inventory` | 現在の在庫（使い切っていないもの）。各行に袋用の確保量 `reservedQuantity` を付ける |
| POST | `/api/inventory` | 手で追加（期限は省略時に自動計算） |
| PATCH | `/api/inventory/:id` | 量・場所・期限の修正 |
| POST | `/api/inventory/:id/use-up` | 使い切り |
| GET | `/api/fridge` | 冷蔵庫ビュー用。在庫とミールキットを合わせ、期限の近い順に返す（`?location=`、`?kind=ingredient\|meal_kit`、`?expiringSoon=true`） |

- 追加: 購入日は省略時に今日、保存場所は省略時にマスタの既定、期限は省略時に「購入日 + 保存場所の日持ち」（`shared/domain/expiry.ts`）。冷凍できない食材を冷凍にすると 400 `CANNOT_FREEZE`
- 修正: 期限を指定せずに場所だけ変えたら、購入日から期限を計算し直す。量を 0 にすると使い切り（204）
- 確保量: `stored` の袋の `before_cook` の量を、食材ごとに期限の近い在庫行から割り当てて `reservedQuantity` / `reservedFor` を付ける（`shared/domain/reservations.ts`。袋詰め・調理で減らす順と同じ）
- 期限間近は `期限 − 今日 ≤ 2 日`（過ぎたものを含む）。`expiryStatus` は `expired` / `soon` / `ok`

```ts
// GET /api/fridge の要素
{
  kind: 'ingredient' | 'meal_kit'
  id: string
  name: string            // 食材名 or 料理名
  quantityText: string | null
  location: 'fridge' | 'freezer' | 'pantry'
  expiresOn: string
  daysLeft: number
  isExpiringSoon: boolean
  reservedFor: string | null  // 食材のうち袋用に確保している分があれば「麻婆豆腐の袋用」
  plannedOn: string | null    // ミールキットの食べる予定日
}
```

## 献立

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/api/plans/current` | 進行中（draft / shopping / prepping）の献立。最大 1 つ。なければ `200 { plan: null }`。stored の献立は袋（`/api/kits`）から見る |
| POST | `/api/plans` | 献立を作る（`{ anchors: [{ recipeId, servings? }] }`）。status = draft。進行中の献立があれば 409 |
| GET | `/api/plans/:id` | 詳細（レシピ、状態） |
| POST | `/api/plans/:id/recommendations` | 提案を計算して返す（保存しない）。`{ maxProposals? }` |
| PUT | `/api/plans/:id/recipes` | 献立のレシピを確定前に置き換える。`{ recipes: [{ recipeId, role, servings, dayIndex }] }` |
| POST | `/api/plans/:id/confirm` | 確定。`{ startsOn }`。買い物リストを生成。draft → shopping |
| POST | `/api/plans/:id/shopping/complete` | 買い物完了。shopping → prepping |
| DELETE | `/api/plans/:id` | draft のときだけ破棄できる |

```ts
// POST /api/plans/:id/recommendations のレスポンス
{
  proposals: {
    recipes: { recipeId: string, servings: number, dayIndex: number }[]  // anchor + 追加。dayIndex は初期値
    kitLocations: { recipeId: string, location: 'fridge' | 'freezer' }[]   // 食べる順から決まる袋の保存場所
    score: number
    shopping: { ingredientId, name, needQuantity, packageUnitId, packageLabel, packageCount, buyQuantity }[]
    leftovers: { ingredientId, name, quantity, unit, perishable: boolean }[]
    usesInventory: { inventoryItemId, name, quantity, expiresOn, isExpiringSoon }[]
    totalCaloriesKcal: number | null  // Σ 1人前カロリー × 食数。不明なレシピがあれば null
    warnings: string[]                // 「1.6L に収まるか未確認」など
  }[]
  aiSuggestionRecommended: boolean   // 余りが大きく、登録レシピで埋まらない
}
```

## 買い物リスト

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/api/plans/:id/shopping` | 売り場順に並べて返す |
| POST | `/api/plans/:id/shopping` | 手で行を追加 |
| POST | `/api/shopping-items/:id/check` | チェック → 在庫を作る（冪等） |
| POST | `/api/shopping-items/:id/uncheck` | チェックを外す → 作った在庫を消す |
| PATCH | `/api/shopping-items/:id` | 個数・販売単位の変更（実際に違うパックを買ったとき）。チェック済みなら、まだ減っていない在庫行の量も同じ batch で更新 |

check / uncheck を冪等にしておくと、通信が不安定な店内で再送しても在庫が二重にならない。

## 下ごしらえ・袋詰め

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/api/plans/:id/prep` | 食材ごとに集約した下ごしらえ（今切るもの / 切らずに残すもの） |
| GET | `/api/plans/:id/kits/preview` | 袋詰めの下書き（中身、冷蔵/冷凍の初期値、使用期限、直前作業） |
| POST | `/api/plans/:id/kits` | 袋を保存。packed の在庫を減らし、before_cook を確保として記録し、prepping → stored にする（すべて 1 つの batch）。`{ kits: [{ recipeId, location }] }` |

## ミールキット・調理

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/api/kits` | 一覧（`?status=stored`、`?plannedOn=` で今日の袋） |
| GET | `/api/kits/:id` | 詳細 |
| GET | `/api/kits/:id/cook` | 調理画面用（直前作業、入れる順、ホットクック設定、冷凍時の注意） |
| POST | `/api/kits/:id/cooked` | 作った。直前作業用に確保した在庫を減らす。`{ leftovers?: [{ inventoryItemId, quantity }] }` で余りを修正。全袋が終われば plan を done に |
| POST | `/api/kits/:id/discard` | 捨てた |
| PATCH | `/api/kits/:id` | 保存場所・期限の修正 |
