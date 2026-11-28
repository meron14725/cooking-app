# 食材の日持ち・参考価格（調べた値）

食材マスタ（本番 D1 の `ingredients`）の冷蔵・冷凍・常温の日持ちと参考価格を、ウェブで 1 件ずつ調べた値です。分類ごとの CSV を `docs/data/ingredients/` に置き、確認してマージしたあと、本番 D1 に反映します。

- CSV に入れるのは id・名前・分類・調べた値・出典 URL・メモだけ。別名やレシピ由来の情報は入れない（ユーザー決定 2026-11-28）
- 見つからない・判断できない値は空欄のまま。推測で埋めない
- 本番 D1 の書き出し（`ingredients.json`）・バックアップ・反映 SQL は `.research/` に置く（`.gitignore` 済み。コミットしない・公開しない）

## CSV の列

| 列 | 中身 |
|---|---|
| id | 食材の id（本番 D1） |
| 名前 / 分類 | 書き出したときの名前と分類（野菜 / 肉 / 魚 / 豆腐・卵・乳製品 / 乾物・缶詰 / 調味料 / その他） |
| 冷蔵日数 | 丸ごと・未開封で冷蔵したときの日持ち（日） |
| 冷凍可否 | `可` / `不可` |
| 冷凍日数 | 冷凍したときの日持ち（日）。冷凍不可なら空 |
| 常温日数 | 常温で保存するものだけ（日） |
| 保存場所 | 買ったときの保存場所 `冷蔵` / `冷凍` / `常温` |
| 価格 | 2026 年の首都圏スーパーの、特売でない通常価格（円、税込） |
| 価格の単位 | 価格の量。アプリの代表量（代表の販売単位 → 最初の販売単位 → 基準単位 1 つ、g なら 100g）か、基準単位 1 つ（g なら 100g）。反映するとき代表量あたりに換算する |
| 出典URL | 情報源の URL。複数あれば半角スペースで区切る（日持ち・価格の両方） |
| メモ | 値の根拠や、空欄にした理由 |

日数は 0〜3650 の整数、価格は 1〜20,000 の整数。

### 反映する値・しない値

- 日持ちは、保存場所・冷凍可否・冷蔵日数がそろい、冷凍可なら冷凍日数、常温なら常温日数もある行だけ反映する（足りない行は日持ちを触らない）。常温保存で冷蔵日数が空なら、冷蔵日数に常温日数を入れる（アプリの辞書と同じ「常温で持つ食材は冷蔵でも同じ日数持つ」扱い）。切った後の日持ちは触らない
- 価格は、価格と価格の単位がある行だけ反映する
- 反映した値の出どころは `storage_source` / `price_source` = `researched`（調べた値）
- 手入力（`manual`）の値は上書きしない。`researched` は「分類と価格をまとめて推定」で上書きされず、分類だけを画面で変えても残る。画面で値を変えたら `manual` になる

## 分類ごとの CSV

| ファイル | 件数 | 日持ちを反映 | 価格を反映 |
|---|---|---|---|
| `ingredients/vegetable.csv`（野菜） | 135 | 33 | 15 |
| `ingredients/meat.csv`（肉） | 69 | 31 | 8 |
| `ingredients/fish.csv`（魚） | 53 | 15 | 6 |
| `ingredients/tofu_egg_dairy.csv`（豆腐・卵・乳製品） | 44 | 0 | 4 |
| `ingredients/dry.csv`（乾物・缶詰） | 91 | 2 | 11 |
| `ingredients/seasoning.csv`（調味料） | 198 | 0 | 9 |
| `ingredients/other.csv`（その他） | 82 | 2 | 4 |
| 合計 | 672 | 83 | 57 |

統計が重さあたりで食材が個数単位（枚・本・個・パックなど）のものは、1 個の重さに出典がない限り価格を入れていない（アプリの 1 個あたりの重さは根拠にしない）。メモに統計の単価を残しているので、販売単位の重さに出典があれば足せる。開封後の日数は冷蔵日数に入れずメモだけに書く。端数は四捨五入。

## 手順

すべて手元（Cloudflare にログインした `wrangler` がある環境）で、リポジトリの直下で実行する。

### 1. 本番 D1 から書き出す

```sh
mkdir -p .research
npx wrangler d1 execute cooking-app --remote --json --command "SELECT i.id, i.name, i.aliases, i.category, i.unit, i.grams_per_unit, i.is_staple, i.price_source, i.storage_source, (SELECT json_group_array(json_object('label', p.label, 'quantity', p.quantity, 'isDefault', p.is_default)) FROM (SELECT * FROM package_units p WHERE p.ingredient_id = i.id ORDER BY p.created_at, p.id) p) AS package_units FROM ingredients i WHERE i.archived_at IS NULL ORDER BY i.category, i.name" > .research/ingredients.json
```

調べる前の CSV（id・名前・分類・価格の単位だけ入ったもの）は次で作れる。

```sh
npm run research -- template --export .research/ingredients.json --category 野菜 > docs/data/ingredients/vegetable.csv
```

### 2. CSV を確かめる

```sh
npm run research -- check docs/data/ingredients/*.csv --export .research/ingredients.json
```

範囲外（日持ち 0〜3650 日、価格 1〜20,000 円の外）・矛盾（冷凍不可なのに冷凍日数がある、肉・魚が常温など）・出典なし・価格の単位がアプリの量と合わない、はエラー（終了コード 1）。分類にしては不自然な日持ち（調味料・乾物の冷蔵 14 日未満、肉・魚の冷蔵 15 日以上など）と、日持ちがそろわず反映しない行は警告。

### 3. 反映の前に本番 D1 をバックアップする

CSV の PR をマージしてから行う。

```sh
# 丸ごと SQL で書き出す（戻すときは新しい D1 に --file で流す）
npx wrangler d1 export cooking-app --remote --output .research/backup-$(date +%Y%m%d-%H%M).sql
# Time Travel の今の位置（bookmark）も控えておく
npx wrangler d1 time-travel info cooking-app
```

バックアップのファイルは公開しない（コミットしない・GitHub Actions の artifact などに上げない）。

### 4. 反映する SQL を作って流す

書き出しは反映の直前にやり直す（販売単位が変わっていると価格の換算がずれるため）。

```sh
npx wrangler d1 execute cooking-app --remote --json --command "SELECT i.id, i.name, i.aliases, i.category, i.unit, i.grams_per_unit, i.is_staple, i.price_source, i.storage_source, (SELECT json_group_array(json_object('label', p.label, 'quantity', p.quantity, 'isDefault', p.is_default)) FROM (SELECT * FROM package_units p WHERE p.ingredient_id = i.id ORDER BY p.created_at, p.id) p) AS package_units FROM ingredients i WHERE i.archived_at IS NULL ORDER BY i.category, i.name" > .research/ingredients.json
npm run research -- sql --export .research/ingredients.json --out .research/apply.sql docs/data/ingredients/*.csv
# 中身を見てから流す
npx wrangler d1 execute cooking-app --remote --file .research/apply.sql
```

- SQL は 1 行 1 つの `UPDATE`。バインド変数を使わないので、D1 の 1 クエリ 100 変数の上限に当たらない
- 各文は `WHERE id = … AND archived_at IS NULL AND (… IS NULL OR … <> 'manual')` なので、手入力の値と削除済みの食材は変えない
- 出典 URL の列（`price_source_urls` / `storage_source_urls`、migration 0012）が本番に入っていれば `--source-urls` を付ける。出典を最大 3 件ずつ入れる。0012 がマージされて本番に `migrations apply` されるまでは付けない（列がなくて失敗する）
- 書き出しに `package_units` がない（上の SELECT 以外で書き出した）ときは SQL を作らない。代表量が分からず価格の換算を誤るため

### 戻すとき

```sh
npx wrangler d1 time-travel restore cooking-app --bookmark=<3 で控えた bookmark>
```
