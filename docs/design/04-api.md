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
| GET | `/api/ingredients` | 一覧（`?q=` で名前・別名を検索、`?category=`） |
| POST | `/api/ingredients` | 作成（販売単位を含めて作れる） |
| GET | `/api/ingredients/:id` | 詳細（販売単位を含む） |
| PATCH | `/api/ingredients/:id` | 更新 |
| DELETE | `/api/ingredients/:id` | 論理削除 |
| POST | `/api/ingredients/:id/package-units` | 販売単位を追加 |
| PATCH / DELETE | `/api/package-units/:id` | 販売単位を更新・削除 |

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
    quantity: number | null      // 基準単位
    unit: string | null
    cutStyle: string | null
  }[]
  steps: { phase: 'prep' | 'cook', text: string }[]
  warnings: string[]             // 「1.6Lを超える可能性」など
}
```

## 在庫・冷蔵庫ビュー

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/api/inventory` | 現在の在庫（使い切っていないもの） |
| POST | `/api/inventory` | 手で追加（期限は省略時に自動計算） |
| PATCH | `/api/inventory/:id` | 量・場所・期限の修正 |
| POST | `/api/inventory/:id/use-up` | 使い切り |
| GET | `/api/fridge` | 冷蔵庫ビュー用。在庫とミールキットを合わせ、期限の近い順に返す（`?location=`） |

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
}
```

## 献立

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/api/plans/current` | 進行中（done 以外）の献立。なければ 404 |
| POST | `/api/plans` | 献立を作る（`{ anchorRecipeIds }`）。status = draft |
| GET | `/api/plans/:id` | 詳細（レシピ、状態） |
| POST | `/api/plans/:id/recommendations` | 提案を計算して返す（保存しない）。`{ recipeIds?, maxProposals? }` |
| PUT | `/api/plans/:id/recipes` | 献立のレシピを確定前に置き換える |
| POST | `/api/plans/:id/confirm` | 確定。買い物リストを生成。draft → shopping |
| POST | `/api/plans/:id/advance` | 次の状態へ（shopping → prepping、prepping → stored） |
| DELETE | `/api/plans/:id` | draft のときだけ破棄できる |

```ts
// POST /api/plans/:id/recommendations のレスポンス
{
  proposals: {
    recipeIds: string[]           // anchor + 追加
    score: number
    shopping: { ingredientId, name, needQuantity, packageUnitId, packageLabel, packageCount, buyQuantity }[]
    leftovers: { ingredientId, name, quantity, unit, perishable: boolean }[]
    usesInventory: { inventoryItemId, name, quantity, expiresOn, isExpiringSoon }[]
    totalCaloriesKcal: number | null
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
| PATCH | `/api/shopping-items/:id` | 個数の変更（実際に違うパックを買ったとき） |

check / uncheck を冪等にしておくと、通信が不安定な店内で再送しても在庫が二重にならない。

## 下ごしらえ・袋詰め

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/api/plans/:id/prep` | 食材ごとに集約した下ごしらえ（今切るもの / 切らずに残すもの） |
| GET | `/api/plans/:id/kits/preview` | 袋詰めの下書き（中身、冷蔵/冷凍の初期値、使用期限、直前作業） |
| POST | `/api/plans/:id/kits` | 袋を保存。在庫を減らす。prepping → stored。`{ kits: [{ recipeId, location }] }` |

## ミールキット・調理

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/api/kits` | 一覧（`?status=stored`） |
| GET | `/api/kits/:id` | 詳細 |
| GET | `/api/kits/:id/cook` | 調理画面用（直前作業、入れる順、ホットクック設定、冷凍時の注意） |
| POST | `/api/kits/:id/cooked` | 作った。直前作業用に確保した在庫を減らす。`{ leftovers?: [{ inventoryItemId, quantity }] }` で余りを修正。全袋が終われば plan を done に |
| POST | `/api/kits/:id/discard` | 捨てた |
| PATCH | `/api/kits/:id` | 保存場所・期限の修正 |

## 設定

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/api/settings` | |
| PATCH | `/api/settings` | |
