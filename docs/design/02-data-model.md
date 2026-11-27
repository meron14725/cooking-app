# 02. データモデル

DB は Cloudflare D1（SQLite）。スキーマは Drizzle で定義し、マイグレーションは drizzle-kit で生成します。

## 全体像

```
ingredients（食材マスタ）──< package_units（販売単位）
     │
     ├──< recipe_ingredients >── recipes（レシピ）──< recipe_steps（手順）
     │
     ├──< inventory_items（在庫：バラの食材）
     │
     ├──< shopping_items >── plans（献立＝1サイクル）──< plan_recipes >── recipes
     │                          │
     └──< meal_kit_items >── meal_kits（ミールキット＝袋）
```

## 共通ルール

- 主キーは `id TEXT`（ULID）。時系列で並ぶので一覧の並び替えにも使える
- 日時は `TEXT`（ISO 8601、UTC）。日付だけのもの（購入日、期限）は `TEXT`（`YYYY-MM-DD`、Asia/Tokyo 基準）
- 真偽値は `INTEGER`（0/1）
- `created_at`, `updated_at` を全テーブルに持つ（下の表では省略）

## 単位の扱い

計算（必要量・在庫・販売単位）を単純にするため、**食材ごとに基準単位を 1 つ決め、量はすべて基準単位の数値で持つ**。

- 例: 玉ねぎ = `個`、豚こま = `g`、豆腐 = `丁`、牛乳 = `ml`
- レシピの「玉ねぎ 1/2個」は `quantity = 0.5`。表示用に元の文字列 `display_text` も保持
- 「少々」「適量」は `quantity = NULL` とし、計算対象外（調味料はほぼこれ）
- 単位換算（大さじ→ml など）はしない。登録時に基準単位で入れる。URL 取り込みでは AI に基準単位への変換を依頼し、本人が確認する

## テーブル

### ingredients（食材マスタ）

| 列 | 型 | 説明 |
|---|---|---|
| id | TEXT PK | |
| name | TEXT UNIQUE | 例: 玉ねぎ |
| aliases | TEXT (JSON配列) | 表記ゆれ。例: ["たまねぎ","タマネギ"]。URL取り込み時の照合に使う |
| category | TEXT | 売り場の区分: `vegetable` 野菜 / `meat` 肉 / `fish` 魚 / `tofu_egg_dairy` 豆腐・卵・乳製品 / `seasoning` 調味料 / `dry` 乾物・缶詰 / `other` |
| unit | TEXT | 基準単位: `個` `本` `枚` `g` `ml` `丁` `袋` `パック` など |
| can_freeze | INTEGER | 冷凍できるか |
| fridge_days | INTEGER | 冷蔵の日持ち目安（日） |
| freezer_days | INTEGER NULL | 冷凍の日持ち目安（日）。`can_freeze=0` なら NULL |
| pantry_days | INTEGER NULL | 常温の日持ち目安。常温保存しないなら NULL |
| default_location | TEXT | 買ったときの保存場所: `fridge` / `freezer` / `pantry` |
| cut_before_cook | INTEGER | ホットクックに入れる直前に切る必要があるか（例: 豆腐、じゃがいも） |
| cut_before_cook_note | TEXT NULL | 例: 「冷凍できないので直前に切る」 |
| frozen_cook_note | TEXT NULL | 冷凍のまま入れる場合の注意。例: 「加熱時間が延びることがある」 |
| is_staple | INTEGER | 常備品（調味料など）。使い切り計算の対象外 |
| archived_at | TEXT NULL | 論理削除 |

### package_units（販売単位）

| 列 | 型 | 説明 |
|---|---|---|
| id | TEXT PK | |
| ingredient_id | TEXT FK | |
| label | TEXT | 例: 「3個入り」「1パック 200g」 |
| quantity | REAL | 基準単位での量。例: 3（個）、200（g） |
| is_default | INTEGER | 買い物リストで最初に使う単位 |

1 食材に複数の販売単位（1個売り、3個入り）を持てる。どれを買うかはレコメンドが決める（[05](./05-recommendation.md)）。

### recipes（レシピ）

| 列 | 型 | 説明 |
|---|---|---|
| id | TEXT PK | |
| title | TEXT | |
| servings | REAL | 何人前。基準は成人男性 1 人前 |
| calories_kcal | INTEGER NULL | 1 人前あたり |
| hotcook_mode | TEXT NULL | 例: 「手動 → 煮物を作る → まぜる → 30分」 |
| hotcook_menu_no | TEXT NULL | 公式メニュー番号（将来用。初期は使わない） |
| fits_1_6l | INTEGER | 1.6L 機で作れるか（デフォルト 1） |
| source_type | TEXT | `manual` / `url` / `ai` |
| source_url | TEXT NULL | |
| notes | TEXT NULL | メモ |
| archived_at | TEXT NULL | 論理削除 |

### recipe_ingredients（レシピの材料）

| 列 | 型 | 説明 |
|---|---|---|
| id | TEXT PK | |
| recipe_id | TEXT FK | |
| ingredient_id | TEXT FK | マスタに必ず紐づける（計算のため） |
| quantity | REAL NULL | 基準単位。NULL = 少々・適量 |
| display_text | TEXT | 表示用。例: 「玉ねぎ 1/2個」 |
| cut_style | TEXT NULL | 切り方。例: 「くし切り」 |
| cut_timing | TEXT | `prep`（下ごしらえで切る） / `before_cook`（直前に切る） / `none`（切らない） 。初期値はマスタの `cut_before_cook` から決める |
| add_order | INTEGER | ホットクックに入れる順 |
| sort_order | INTEGER | 表示順 |

### recipe_steps（手順）

| 列 | 型 | 説明 |
|---|---|---|
| id | TEXT PK | |
| recipe_id | TEXT FK | |
| step_no | INTEGER | |
| phase | TEXT | `prep`（下ごしらえ） / `cook`（調理） |
| text | TEXT | |

### inventory_items（在庫：バラの食材）

| 列 | 型 | 説明 |
|---|---|---|
| id | TEXT PK | |
| ingredient_id | TEXT FK | |
| quantity | REAL | 残量（基準単位） |
| location | TEXT | `fridge` / `freezer` / `pantry` |
| purchased_on | TEXT | 購入日 |
| expires_on | TEXT | 期限の目安。登録時に計算、手で直せる |
| source | TEXT | `shopping`（買い物チェック） / `leftover`（使い残り） / `manual` |
| shopping_item_id | TEXT NULL | 買い物リストから来た場合 |
| used_up_at | TEXT NULL | 使い切った日時。NULL のものが現在の在庫 |

同じ食材でも購入日が違えば別の行。期限が近い行から使う。

### plans（献立 ＝ 1サイクル）

| 列 | 型 | 説明 |
|---|---|---|
| id | TEXT PK | |
| status | TEXT | 下の状態遷移を参照 |
| confirmed_at | TEXT NULL | 献立を確定した日時 |
| completed_at | TEXT NULL | 全部の袋を使い終えた日時 |

状態遷移:

```
draft（献立を組んでいる）
  → shopping（確定済み。買い物中）
  → prepping（下ごしらえ・袋詰め中）
  → stored（袋が冷蔵庫/冷凍庫にある）
  → done（全部作り終えた）
```

同時に `draft`〜`prepping` の献立は 1 つまで（自分専用なので単純にする）。

### plan_recipes（献立に入るレシピ）

| 列 | 型 | 説明 |
|---|---|---|
| plan_id | TEXT FK | |
| recipe_id | TEXT FK | |
| role | TEXT | `anchor`（食べたくて選んだ） / `added`（提案から追加） |
| sort_order | INTEGER | |

### shopping_items（買い物リスト）

献立確定時にレコメンド結果から生成します。

| 列 | 型 | 説明 |
|---|---|---|
| id | TEXT PK | |
| plan_id | TEXT FK | |
| ingredient_id | TEXT FK | |
| need_quantity | REAL | 不足量（必要量 − 使える在庫） |
| package_unit_id | TEXT NULL | 買う販売単位。NULL = 量り売りなど |
| package_count | INTEGER | 何パック買うか |
| buy_quantity | REAL | 買う量（= 販売単位 × 個数） |
| checked_at | TEXT NULL | 買ったチェック。チェック時に `inventory_items` を作る |
| is_manual | INTEGER | 手で足した行（調味料の買い足しなど） |

### meal_kits（ミールキット＝袋）

| 列 | 型 | 説明 |
|---|---|---|
| id | TEXT PK | |
| plan_id | TEXT FK | |
| recipe_id | TEXT FK | |
| location | TEXT | `fridge` / `freezer` |
| packed_on | TEXT | 作成日 |
| use_by | TEXT | 使用期限の目安 |
| status | TEXT | `stored` / `cooked` / `discarded` |
| cooked_at | TEXT NULL | |

### meal_kit_items（袋の中身と直前作業）

| 列 | 型 | 説明 |
|---|---|---|
| id | TEXT PK | |
| meal_kit_id | TEXT FK | |
| ingredient_id | TEXT FK | |
| quantity | REAL NULL | |
| state | TEXT | `packed`（袋に入っている） / `before_cook`（袋に入れず、直前に切って入れる） |
| inventory_item_id | TEXT NULL | `before_cook` の場合、確保している在庫 |

### settings（設定）

| 列 | 型 | 説明 |
|---|---|---|
| key | TEXT PK | |
| value | TEXT (JSON) | 例: `target_recipe_count = 3`、`expiring_soon_days = 2` |

## 期限の計算

```
在庫の期限    = 購入日 + マスタの日持ち（保存場所に応じて fridge_days / freezer_days / pantry_days）
袋の保存場所  = 袋に入る食材（state=packed）がすべて can_freeze なら冷凍、そうでなければ冷蔵
袋の使用期限  = 作成日 + 袋に入る食材の日持ちの最小値（保存場所に応じた値）
期限が近い    = 期限 − 今日 ≤ settings.expiring_soon_days（初期値 2日）
```

冷凍にするか冷蔵にするかは、袋詰め画面で本人が変更できます（冷蔵のほうが早く食べるなら冷蔵にする、など）。冷凍できない食材が入っているのに冷凍を選んだときは警告を出します。

## 在庫の動き

| 操作 | 在庫への影響 |
|---|---|
| 買い物リストをチェック | `inventory_items` を作る（購入日=今日、期限を計算） |
| チェックを外す | 作った在庫を削除（まだ使っていなければ） |
| 袋詰め | 使った量を在庫から減らす（期限の近い行から）。`before_cook` の食材は在庫に残したまま袋に紐づける |
| 調理完了 | 袋を `cooked` に。`before_cook` で確保していた在庫を減らす |
| 手で修正 | 冷蔵庫ビューから量・期限・場所を直す、使い切りにする |

使い残りは在庫に残り、次のレコメンドで優先されます。
