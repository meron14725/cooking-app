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

- 日持ちは、保存場所・冷凍可否・冷蔵日数がそろい、冷凍可なら冷凍日数、常温なら常温日数もある行だけ反映する（足りない行は日持ちを触らない）。分類（CSV の分類列）が調味料・乾物・缶詰の行は、冷凍可否が空でも保存場所と冷蔵日数（常温なら常温日数）がそろえば反映し、冷凍可否・冷凍日数は本番の値のまま触らない（メーカーは未開封の賞味期限だけを書き、冷凍の可否を書かないことが多いため。冷凍可否が空で冷凍日数がある・保存場所が冷凍の行は反映しない）。常温保存で冷蔵日数が空なら、冷蔵日数に常温日数を入れる（アプリの辞書と同じ「常温で持つ食材は冷蔵でも同じ日数持つ」扱い）。切った後の日持ちは触らない
- 価格は、価格と価格の単位がある行だけ反映する
- 反映した値の出どころは `storage_source` / `price_source` = `researched`（調べた値）
- 手入力（`manual`）の値は上書きしない。`researched` は「分類と価格をまとめて推定」で上書きされず、分類だけを画面で変えても残る。画面で値を変えたら `manual` になる

## 分類ごとの CSV

| ファイル | 件数 | 日持ちを反映 | 価格を反映 |
|---|---|---|---|
| `ingredients/vegetable.csv`（野菜） | 135 | 37 | 65 |
| `ingredients/meat.csv`（肉） | 58 | 31 | 31 |
| `ingredients/fish.csv`（魚） | 48 | 16 | 28 |
| `ingredients/tofu_egg_dairy.csv`（豆腐・卵・乳製品） | 45 | 29 | 31 |
| `ingredients/dry.csv`（乾物・缶詰） | 101 | 36 | 77 |
| `ingredients/seasoning.csv`（調味料） | 203 | 100 | 111 |
| `ingredients/other.csv`（その他） | 82 | 2 | 34 |
| 合計 | 672 | 251 | 377 |

行は `fixes/` で直したあとの分類のファイルに置いている（分類列と同じ）。

統計が重さあたりで食材が個数単位（枚・本・個・パックなど）のものは、1 個の重さに出典がない限り価格を入れていない（アプリの 1 個あたりの重さは根拠にしない）。メモに統計の単価を残しているので、販売単位の重さに出典があれば足せる。統計の基本銘柄そのものが個数で決まっているもの（卵 10 個入り・焼きのり全形 10 枚・カレールウ 12 皿分）は、重さを使わずその個数で割っていて、基本銘柄の表を出典URLに入れている。開封後の日数は冷蔵日数に入れずメモだけに書く。端数は四捨五入。

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

## 食材マスタの手直し（`fixes/`）

COCORO の取り込みで崩れた名前（「ゆでだこ」が「だこ」になったなど）と、分類の誤り（ツナ缶が肉、牛乳が肉など）を直す SQL を `docs/data/fixes/` に置く。

- `2026-11-28-names-categories.sql`: 名前と分類の直し
- `2026-11-28-canned-goods.sql`: 魚の缶詰（さば水煮・ツナ缶など 10 件）を魚から乾物・缶詰に移す。魚の分類では常温を入れられず、メーカーの未開封の賞味期限（常温）を反映できないため

リポジトリには直す行だけを書く。

- 名前: `WHERE name = <直す前の名前>` で当てる。手で名前を変えた食材と、直したあとの名前の食材がもうあるものは変えない。前の名前は別名（aliases）に足す（取り込みで同じ名前が来ても当たるように）
- 分類: `WHERE category = <直す前の分類>` で当て、手で分類を直した食材（`attributes_source = 'manual'`）は変えない。直したら画面で分類を変えたときと同じく `attributes_source = 'manual'` にし、日持ちは `manual`・`researched` なら出典 URL（`storage_source_urls`）ごと残し、それ以外（`rule`・`ai`）は未見直し（NULL）に戻して出典 URL を空にし、次のまとめて推定で入れ直す。価格は変えない。`storage_source_urls`（migration 0012）が本番にあることが前提
- 削除済みの食材は変えない。バインド変数は使わない。何度流しても同じ結果になる

調べた値の反映（上の手順 4）とはどちらが先でもよい（反映は id で当て、分類は本番でなく CSV の分類列を使う。分類列は直したあとの分類になっている）。直したあとの check では、分類を直した行に「分類が本番と違う」の警告が出る。

```sh
# 3 と同じくバックアップしてから
npx wrangler d1 execute cooking-app --remote --file docs/data/fixes/2026-11-28-names-categories.sql
npx wrangler d1 execute cooking-app --remote --file docs/data/fixes/2026-11-28-canned-goods.sql
# 直したあとを確かめる
npx wrangler d1 execute cooking-app --remote --command "SELECT id, name, category, attributes_source, storage_source, price_source FROM ingredients WHERE id IN ('cocoro-ing-86f9291b03fada7c','cocoro-ing-805f098baf856ecc','cocoro-ing-d83186c382956785','cocoro-ing-036510f351f39314','cocoro-ing-17981125f32ac00e','cocoro-ing-1712a3ce4ee5a8fd','cocoro-ing-e29c547b01db675d','cocoro-ing-a12693efc2b59c15','cocoro-ing-607101f2db7772bb','cocoro-ing-ddf0221dc4ddb6c0','cocoro-ing-d6fc79f54304d5c5','cocoro-ing-2dba159552bc9087','cocoro-ing-c8afaca72bca28bf','cocoro-ing-e4cadd5652622bac','cocoro-ing-a82ea8c2a576bcac','cocoro-ing-3856f75b56b5aae4','cocoro-ing-d641ac57da3a45a1','cocoro-ing-074d591a6c97f50f','cocoro-ing-94839dac97c65692','cocoro-ing-bfb3504855a1e61d','cocoro-ing-a4fe68af5dd20369','cocoro-ing-ad648b690e61443d','cocoro-ing-bd6b9237ec46fb69','cocoro-ing-d4671649dd9b1617','cocoro-ing-c53cce4b3f0a9f47','cocoro-ing-c9280853bf8f115c','cocoro-ing-8fdeea17283e59df','cocoro-ing-24c150950eb7dbd7','cocoro-ing-76dbc35de5a3b59e','cocoro-ing-32d8c87c762eecd0','cocoro-ing-c6de1ebb9d25ae64','cocoro-ing-6a19eef6506c92c8','cocoro-ing-b1c61971b6e12175','cocoro-ing-9c18aa122a4a3cad','cocoro-ing-2dd27371446f8a6a','cocoro-ing-b23373afbe2c002b','cocoro-ing-13da3b7e61d876bb','cocoro-ing-11407b7ece967905','cocoro-ing-63eb94bffefbceda','cocoro-ing-7861d9e71d0b66de','cocoro-ing-1b1bb5017bd829d1','cocoro-ing-8d7330c954421f74','cocoro-ing-bf82ec41c9cb988c','cocoro-ing-4078dede92d7b427','cocoro-ing-075941715b1e3369') ORDER BY category, name"
```
