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
- 日時は `TEXT`（ISO 8601、UTC）。日付だけのもの（購入日、期限、食べる予定日）は `TEXT`（`YYYY-MM-DD`、Asia/Tokyo 基準）
- Workers は UTC で動くので、「今日」は `shared/domain/date.ts` の `todayJst()` だけで作る。レコメンドや期限計算などの純粋関数は `today` を引数で受け取り、自分では時計を読まない（テストで日付を固定できる）
- 真偽値は `INTEGER`（0/1）
- `created_at`, `updated_at` を全テーブルに持つ（下の表では省略）。DB 側の既定値も現在時刻にして、SQL で直接入れても埋まるようにする
- 設定値（1回の品数 3、期限間近 2日 など）は MVP ではテーブルにせず `shared/domain/constants.ts` の定数にする。画面から変えたくなったら settings テーブルを足す

## 単位の扱い

計算（必要量・在庫・販売単位）を単純にするため、**内部では食材ごとに基準単位を 1 つ決め、量はすべて基準単位の数値で持つ**。ただし入口（レシピの取り込み・登録）では重さ表記を換算する。

- 例: 玉ねぎ = `個`、豚こま = `g`、豆腐 = `丁`、牛乳 = `ml`
- レシピの「玉ねぎ 1/2個」は `quantity = 0.5`。表示用に元の文字列 `display_text` も保持
- 「少々」「適量」は `quantity = NULL` とし、計算対象外（調味料はほぼこれ）
- **入口での換算**: 基準単位が個・本・枚などの食材に g 表記が来たら、マスタの `grams_per_unit`（1個あたりのおよその重さ）で `quantity = g / grams_per_unit` に換算する。例: にんじん 100g、`grams_per_unit = 150` → 0.67本
- 換算できない（`grams_per_unit` が NULL、または ml ↔ 個のように対応がない）ときは `quantity = NULL` にし、`warnings` に「単位を確認してください」を出して本人に直してもらう
- 大さじ・小さじ・カップは換算しない。ほぼ調味料（常備品で計算対象外）のため
- 換算は `shared/domain/units.ts` の純粋関数にし、URL 取り込み・AI 提案・手登録で共通に使う

## テーブル

### ingredients（食材マスタ）

| 列 | 型 | 説明 |
|---|---|---|
| id | TEXT PK | |
| name | TEXT UNIQUE | 例: 玉ねぎ |
| aliases | TEXT (JSON配列) | 表記ゆれ。例: ["たまねぎ","タマネギ"]。URL取り込み時の照合に使う |
| category | TEXT | 売り場の区分: `vegetable` 野菜 / `meat` 肉 / `fish` 魚 / `tofu_egg_dairy` 豆腐・卵・乳製品 / `seasoning` 調味料 / `dry` 乾物・缶詰 / `other` |
| unit | TEXT | 基準単位: `個` `本` `枚` `g` `ml` `丁` `袋` `パック` など |
| grams_per_unit | REAL NULL | 基準単位 1 つあたりのおよその重さ（g）。基準単位が g なら NULL |
| can_freeze | INTEGER | 冷凍できるか |
| fridge_days | INTEGER | 丸ごと・未開封で冷蔵したときの日持ち目安（日） |
| freezer_days | INTEGER NULL | 丸ごと冷凍したときの日持ち目安。`can_freeze=0` なら NULL |
| pantry_days | INTEGER NULL | 常温の日持ち目安。常温保存しないなら NULL |
| prepped_fridge_days | INTEGER NULL | 切った後に冷蔵したときの日持ち。NULL なら定数の上限（冷蔵 2 日）を使う |
| prepped_freezer_days | INTEGER NULL | 切った後に冷凍したときの日持ち。NULL なら定数の上限（冷凍 21 日）を使う |
| default_location | TEXT | 買ったときの保存場所: `fridge` / `freezer` / `pantry` |
| before_cook_task | TEXT NULL | 保存場所に関係なく、入れる直前に必要な作業。例: 「豆腐を2cm角に切る」「乾物を水で戻す」「卵を割る」。NULL なら直前作業なし |
| frozen_cook_note | TEXT NULL | 冷凍のまま入れる場合の注意。例: 「加熱時間が延びることがある」 |
| is_staple | INTEGER | 常備品（調味料など）。使い切り計算の対象外 |
| archived_at | TEXT NULL | 論理削除 |

直前作業は 2 種類あります。

1. **いつでも直前**: `before_cook_task` がある食材（豆腐など）。袋には入れず、調理時に作業する
2. **冷凍する袋のときだけ直前**: `can_freeze = 0` の食材（じゃがいもなど）。冷蔵の袋なら下ごしらえで切って入れられるが、冷凍の袋なら切らずに残し、調理時に切る

どちらになるかは、袋の保存場所（＝食べる日）から決まります（下の「袋の保存場所と期限」）。

### package_units（販売単位）

| 列 | 型 | 説明 |
|---|---|---|
| id | TEXT PK | |
| ingredient_id | TEXT FK | |
| label | TEXT | 例: 「3個入り」「1パック 200g」 |
| quantity | REAL | 基準単位での量。例: 3（個）、200（g） |
| is_default | INTEGER | 代表の販売単位。ムダの正規化と、買い物リストの初期値に使う |

1 食材に複数の販売単位（1個売り、3個入り）を持てる。どれを買うかはレコメンドが決める（[05](./05-recommendation.md)）。

### recipes（レシピ）

| 列 | 型 | 説明 |
|---|---|---|
| id | TEXT PK | |
| title | TEXT | |
| servings | REAL | 材料の量が何人前か（元のレシピのまま。取り込んだ「2人分」は 2） |
| calories_kcal | INTEGER NULL | 1 人前あたり |
| calories_estimated | INTEGER | 1 = AI 推定値（画面で「目安（AI推定）」と表示）。既定値 0 |
| hotcook_mode | TEXT NULL | 例: 「手動 → 煮物を作る → まぜる → 30分」 |
| max_servings_1_6l | REAL NULL | 1.6L 機で一度に作れる最大の人数分。NULL = 不明（チェックせず、画面で注意を出す） |
| pack_seasonings | INTEGER | 1 = 調味料も袋に入れる（下味冷凍）。調理時に入れるものが減る |
| source_type | TEXT | `manual` / `url` / `ai` / `seed` |
| source_url | TEXT NULL | |
| notes | TEXT NULL | メモ |
| archived_at | TEXT NULL | 論理削除 |

公式メニュー番号の列は、使うことになった時点でマイグレーションで足します。

### recipe_ingredients（レシピの材料）

| 列 | 型 | 説明 |
|---|---|---|
| id | TEXT PK | |
| recipe_id | TEXT FK | |
| ingredient_id | TEXT FK | マスタに必ず紐づける（計算のため） |
| quantity | REAL NULL | 基準単位、`recipes.servings` 人前の量。NULL = 少々・適量 |
| display_text | TEXT | 表示用。例: 「玉ねぎ 1/2個」「にんじん 100g」 |
| cut_style | TEXT NULL | 切り方。例: 「くし切り」。NULL = 切らない |
| add_order | INTEGER | ホットクックに入れる順 |
| sort_order | INTEGER | 表示順 |

「今切るか、直前に切るか」はレシピには持たず、献立の時点で決めます（袋の保存場所による）。

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
| starts_on | TEXT NULL | 1日目の日付。確定時に決める（初期値は翌日） |
| confirmed_at | TEXT NULL | 献立を確定した日時 |
| completed_at | TEXT NULL | 全部の袋を使い終えた日時 |

状態遷移:

```
draft（献立を組んでいる）
  → shopping（確定済み。買い物中）          … POST /plans/:id/confirm
  → prepping（下ごしらえ・袋詰め中）        … POST /plans/:id/shopping/complete
  → stored（袋が冷蔵庫/冷凍庫にある）       … POST /plans/:id/kits（袋の保存と同じ batch）
  → done（全部作り終えた）                  … 最後の袋の cooked / discard と同じ batch
```

- **進行中の献立** = `draft` / `shopping` / `prepping` のもの。同時に 1 つまで
- `stored` の献立は袋が残っている状態で、次の献立（draft）と同時に存在してよい（3日サイクルでは普通に起きる）

### plan_recipes（献立に入るレシピ）

| 列 | 型 | 説明 |
|---|---|---|
| plan_id | TEXT FK | |
| recipe_id | TEXT FK | |
| role | TEXT | `anchor`（食べたくて選んだ） / `added`（提案から追加） |
| servings | REAL | この献立で何食分作るか。初期値は定数（1） |
| day_index | INTEGER | 何日目に食べるか（1, 2, 3 …）。確定時に決める |

材料の量はすべて `係数 = plan_recipes.servings / recipes.servings` を掛けて使う。レシピ自体の量は書き換えない。

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
| servings | REAL | 何食分か（plan_recipes から） |
| location | TEXT | `fridge` / `freezer` |
| packed_on | TEXT | 作成日 |
| planned_on | TEXT | 食べる予定日（`starts_on + day_index − 1`）。ホームの「今日はこの袋」に使う |
| use_by | TEXT | 使用期限の目安 |
| status | TEXT | `stored` / `cooked` / `discarded` |
| cooked_at | TEXT NULL | |

### meal_kit_items（袋の中身と直前作業）

| 列 | 型 | 説明 |
|---|---|---|
| id | TEXT PK | |
| meal_kit_id | TEXT FK | |
| ingredient_id | TEXT FK | |
| quantity | REAL NULL | 基準単位（スケール後） |
| state | TEXT | `packed`（袋に入っている） / `before_cook`（袋に入れず、在庫から直前に出す） / `seasoning_packed`（下味冷凍で袋に入れた調味料） |
| before_cook_task | TEXT NULL | `before_cook` のときの作業内容。例: 「冷凍できないので直前に切る（乱切り）」 |

`before_cook` の行は「この袋のために確保している在庫」を表します。在庫行への紐づけは持たず、量だけで確保します（下の「在庫の動き」）。

## 袋の保存場所と期限

献立確定時に食べる日（`day_index`）を決め、そこから保存場所と期限を決めます。

```
袋の保存場所:
  planned_on − packed_on ≤ 冷蔵で持つ日数（packed の食材の prepped_fridge_days の最小値、既定 2 日）
    → 冷蔵
  それより先
    → 冷凍（冷凍できない食材は before_cook に回して袋から外す）

袋の使用期限 = 作成日 + 袋に入る食材（state = packed）の「切った後の日持ち」の最小値
  冷蔵: prepped_fridge_days（NULL なら 2 日）
  冷凍: prepped_freezer_days（NULL なら 21 日）

before_cook の食材の期限は在庫側の期限で見る（丸ごとなので長い）
```

- 袋詰め画面で本人が保存場所を変えられる。冷蔵にして `use_by < planned_on` になる場合は警告
- 丸ごとの日持ち（`fridge_days`）は在庫の期限にだけ使い、袋の期限には使わない（切った後や肉と一緒に入れた後は傷みやすいため）

## 期限間近

```
在庫の期限  = 購入日 + マスタの日持ち（保存場所に応じて fridge_days / freezer_days / pantry_days）
期限が近い  = 期限 − 今日 ≤ 2 日（定数）
```

## 在庫の動き

**使える在庫** = 在庫の量 −（`stored` の袋の `before_cook` 行が確保している量）。食材ごとに SQL で集計し、レコメンドにはこの量を渡す。冷蔵庫ビューでは確保分に「〇〇の袋用」と表示する。

| 操作 | 在庫への影響 |
|---|---|
| 買い物リストをチェック | `inventory_items` を作る（購入日=今日、期限を計算）。冪等 |
| チェックを外す | 作った在庫を削除（まだ減っていなければ） |
| チェック済みの行の個数を変える | まだ減っていない在庫行の量を同じ batch で更新 |
| 袋詰め | `packed` の量を在庫から減らす（期限の近い行から）。`before_cook` は減らさず、確保として残す |
| 調理完了 | 袋を `cooked` に。`before_cook` の量を在庫から減らす（期限の近い行から） |
| 袋を捨てる | 袋を `discarded` に。確保は `stored` の袋だけを数えるので、`before_cook` の確保分は自動で解放される（在庫は減らさない） |
| 手で修正 | 冷蔵庫ビューから量・期限・場所を直す、使い切りにする |

使い残りは在庫に残り、次のレコメンドで優先されます。複数の行をまたぐ更新は D1 の `batch` でまとめて行い、途中で失敗して在庫がずれないようにします。
