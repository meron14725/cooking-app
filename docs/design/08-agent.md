# 08. Cursor SDK と AI エージェント

AI を Cursor SDK（`@cursor/sdk`）に移し、Cloudflare Containers の中で動かします。あわせて、言葉で頼むとアプリのデータ（在庫・レシピ・買い物リスト・献立）を変える「AI に頼む」を足します。

- 決定（2026-11-27、本人）: Cursor のサブスク（User API key）と Workers Paid を使う。エージェントが変えてよい範囲は在庫・レシピ・買い物リスト・献立
- 変更は「エージェントが変更案を出す → 画面で差分を見て確認 → 反映」にする（2026-11-27 本人が PR #14 のレビューで了承。下の「確認してから反映する理由」）
- Gemini は予備として残す（`AI_PROVIDER=gemini` で戻せる）

## 調べたこと

| 項目 | 内容 |
|---|---|
| 動く場所 | Node 22.13 以上と、OS ごとのネイティブバイナリ（`@cursor/sdk-linux-x64` など）が要る。workerd（Worker 本体）では動かないので Container で動かす |
| モデルを回す場所 | Cursor 側。Container の中の SDK は道具（ツール）を実行してやり取りするだけ |
| 道具 | `customTools` でアプリ独自の道具を渡せる（プロセス内の関数）。`tools: ['mcp']` にすると組み込みのファイル・シェル・Web 検索などは使えず、渡した道具だけになる |
| 認証・費用 | `CURSOR_API_KEY`（User API key）。「User API keys bill to that user's plan」で、本人のプランの毎週の枠から引かれ、超えた分はトークン単価。Dashboard の Usage に SDK タグで出る |
| モデル | `composer-2.5`（入力 $0.5 / 出力 $2.5、100 万トークンあたり）を既定にする。環境変数 `CURSOR_MODEL` で変えられる |
| 実行方式 | ローカル実行（自分の Container の中で動かす）。Cursor のクラウド VM（Cloud Agents）は使わない。起動が重く、プランの条件も増えるため |
| Container の費用 | Workers Paid に毎月 25 GiB 時間・375 vCPU 分・200 GB 時間が含まれる。`basic`（1/4 vCPU、1 GiB）を 1 回 1 分使うと 0.25 vCPU 分なので、月 1,000 回ほどは枠内。使わないときは止まる（`sleepAfter`） |
| 分からないこと | コールドスタートの秒数（公式の数字なし）。プランごとの SDK の利用条件（ドキュメントに明記なし）。実装の最初に実測する |

参考: [Cursor SDK](https://cursor.com/docs/api/sdk/typescript)、[Models & Pricing](https://cursor.com/docs/models-and-pricing)、[Containers の料金](https://developers.cloudflare.com/containers/pricing/)

## 構成

```
スマホ ─ Access ─ Worker（Hono）
                   ├─ D1
                   └─ AgentContainer（Durable Object + Container。binding: AGENT）
                        └─ Node 22 + @cursor/sdk（local runtime）
                             └─ Cursor のモデル（composer-2.5）
```

- Container は Worker からしか呼べない（公開の入口を持たない）。Access の外に穴はできない
- Container は D1 に触らない。必要なデータは Worker が毎回まとめて渡し、エージェントは「結果」や「変更案」を返すだけ
- `CURSOR_API_KEY` は Worker のシークレットに入れ、Container を起動するときに環境変数で渡す
- インスタンスは 1 つ（`max_instances: 1`、自分専用）。`sleepAfter: '10m'` で使わなければ止まる
- 1 回の実行は 1 つの Agent（`Agent.create` → `send` → `wait`）。会話は続けない（毎回新しく作る）

### Container の中

`container/` に置く小さな Node のサーバ（Hono の node アダプタ）。

| パス | 内容 |
|---|---|
| `POST /structured` | `{ system, prompt, jsonSchema }` → 決まった形の JSON を 1 つ返す（URL 取り込み・補完提案・カロリー推定用） |
| `POST /agent` | `{ instruction, snapshot }` → `{ reply, operations[] }`（「AI に頼む」用） |
| `GET /health` | 起動確認 |

- `/structured`: `submit_result` という道具を 1 つだけ渡し（`inputSchema` は zod から作った JSON スキーマ）、「最後に必ず submit_result を 1 回呼ぶ」と指示する。呼ばれた引数を返す。検証は Worker 側の zod で行う（今の Gemini と同じ）
- `/agent`: 読む道具と、変更案を記録する道具を渡す（下の「道具」）
- エージェントの設定: `tools: ['mcp']`、`local.fs: emptyFs()`（ホストのファイルを見せない）、`settingSources` は渡さない（ルールを読まない）

## AI プロバイダ（既存の 3 機能）

`src/server/ai/cursor.ts` に `CursorProvider` を足し、`AI_PROVIDER=cursor` を既定にします。インターフェース（`extractRecipe` / `suggestRecipe` / `estimateCalories`）は変えないので、画面と API はそのまま使えます。

- プロンプトは `prompts.ts` を共通で使う
- タイムアウト: 1 回の AI 呼び出しの合計を 75 秒にする。1 回目は 45 秒まで、形が違えば残り時間（15 秒以上あれば）で 1 回だけやり直す。画面のタイムアウトは 30 秒 → 90 秒に延ばす（URL 取り込みはページ取得 10 秒が先に入る）
- Container が起動中などで繋がらないときは 503 `AI_STARTING`（画面は「AI を起動しています。少し待ってもう一度」）

実装（#13）:
- `container/`: Node 22 の型除去で `src/main.ts` をそのまま動かす（ビルドなし）。`/structured` と `/health`。依存は `@cursor/sdk` だけで、Cursor SDK はルートの package.json には入れない
  - エージェントは `tools: ['mcp']`、`disallowedTools: ['task']`、`local.fs: emptyFs()`、`local.customTools` に `submit_result` だけ。`systemPrompt` はアカウントごとの有効化が要るので使わず、指示はメッセージの先頭に書く
  - 打ち切りは Container 側でも行い（`run.cancel()`）、504 を返す
- Worker: `AgentContainer`（`@cloudflare/containers` の `Container`、`sleepAfter: '10m'`）。`CURSOR_API_KEY` と `CURSOR_MODEL` を起動時の環境変数で渡す。`CursorProvider` は名前固定の 1 インスタンスに `POST http://agent/structured` を送る
  - Node のテストで `cloudflare:workers` を読まないよう、`ai/index.ts` は `@cloudflare/containers` を import せず `idFromName` で引く
- 確かめたこと（この環境）: イメージを作って起動 → `/health` が返る。ダミーのキーで `/structured` → Cursor まで届いて「Invalid User API Key」が 502 で返る。`wrangler dev` で Worker → Durable Object → Container の経路が通る（ローカルの起動は 1.5 秒ほど）
- まだ確かめていないこと: 本物のキーでの 1 回の時間とトークン数、Cloudflare 上のコールドスタート。キーを入れて最初に使ったときに測って、ここに書く

## AI に頼む（新機能）

### 画面

- S13「AI に頼む」: 「その他」タブから。テキスト欄に頼みたいことを書いて送る
  - 例: 「玉ねぎを半分使った」「鶏むね肉を 2 枚買ってきた。冷凍に入れた」「来週の献立に鮭を入れて」「買い物リストから牛乳を消して」「肉じゃがの砂糖を大さじ 1 に」
- 送ると「考えています…」（最大 90 秒）。終わると、エージェントの返事と変更案の一覧を出す
  - 1 件ずつ「変更前 → 変更後」を出し、チェックボックス（初期はすべてオン）
  - 「反映する」で選んだものを反映、「やめる」で捨てる
  - 反映の結果を 1 件ずつ出す（成功 / 失敗の理由）
- 変更案は保存しない。画面を閉じたら消える（もう一度頼めばよい）

### 確認してから反映する理由

- AI の聞き違い（「半分」→ 0.5 個のつもりが 0.5 パック、など）で在庫や献立が壊れても、反映前に気づける
- 反映は Worker が既存の API と同じサービス関数で行うので、入力の検証（zod）、状態の確認（献立が draft か、など）、二重送信対策がそのまま効く
- Container から D1 に書く道を作らずに済む
- 取り消し（変更履歴）を作らなくてよいので、実装が小さい

### 道具（エージェントに渡すもの）

読む道具は、Worker が渡したスナップショットの中を引くだけです（Container の中で完結）。

| 道具 | 内容 |
|---|---|
| `list_inventory` | 在庫（名前、量、単位、場所、期限、袋用の確保量） |
| `list_ingredients` | 食材マスタ（名前、別名、基準単位、販売単位） |
| `list_recipes` / `get_recipe` | レシピの一覧 / 材料と手順 |
| `list_shopping` | 買い物リスト（献立が shopping のとき） |
| `get_current_plan` | 進行中の献立（状態、料理、食数、食べる順） |

変更案の道具は、呼ばれた内容を `operations` に記録するだけです。DB は変わりません。

| 道具（op） | 反映に使うサービス | 前提 |
|---|---|---|
| `inventory.add` | `createInventoryItem` | |
| `inventory.update` | `updateInventoryItem` | 量・場所・期限 |
| `inventory.use_up` | `useUpInventoryItem` | |
| `recipe.create` | `createRecipe` | 材料はマスタにあるもの。ないときは返事で「先にマスタに足して」と言う |
| `recipe.update` | `updateRecipe` | 丸ごと置き換え。今の内容を `get_recipe` で読んでから |
| `shopping.add` / `shopping.update` / `shopping.delete` / `shopping.check` | 同名の関数 | 献立が shopping のとき |
| `plan.create` | `createPlan` | 進行中の献立がないとき。食べたい料理（anchor）を決める |
| `plan.set_recipes` | `replacePlanRecipes` | 献立が draft のとき。#14 で `replacePlanRecipes` の batch に `plans.updated_at` の更新を足す（今は `plan_recipes` を入れ替えるだけで `plans` の行が変わらず、下の競合検出が効かないため） |

- 袋（meal_kits）と献立の確定・削除、食材マスタの変更、レシピの削除は道具にしない（取り返しがつきにくい、または画面で行う方が早い）
- 各 op の入力は既存の zod スキーマ（`inventoryCreateSchema`、`inventoryPatchSchema`、`recipeInputSchema`、`shoppingAddSchema`、`planCreateSchema`、`planRecipesInputSchema` など）をそのまま JSON スキーマにして `inputSchema` に使う。Worker は反映の前にもう一度 zod で検証する
- ID はスナップショットの ID をそのまま使わせる。名前から探すのはエージェントの仕事

### 変更案の形

```ts
type AgentOperation = {
  op: 'inventory.add' | 'inventory.update' | ...  // 上の表
  targetId: string | null       // 変える行。add / create は null
  input: unknown                // 各サービスの入力（zod で検証する）
  summary: string               // 「玉ねぎ 1個 → 0.5個」など、画面に出す 1 行（Worker が作る）
  baseUpdatedAt: string | null  // スナップショットを作った時点の updated_at（Worker が入れる）
}
type AgentResult = { reply: string; operations: AgentOperation[] }
```

- `summary` はエージェントの文ではなく、Worker が「変更前」（D1 の今の値）と `input` から作る。AI の言い分ではなく実際の差分を見て確認できるように
- エージェントの道具の `inputSchema` に入るのは `op` ごとの `targetId` と `input` だけ。`summary` と `baseUpdatedAt` は道具の引数にしない。Worker が `/api/agent/requests` の応答を作るときに、スナップショットから `targetId` で引いて入れる（AI の写し間違いを入れないため）
- `summary` には副作用も出す。例: `shopping.check` は `checkShoppingItem` で在庫も 1 行作るので「買い物リストの牛乳をチェック ＋ 在庫に牛乳 1本を追加」
- 反映のとき、対象の `updated_at` が `baseUpdatedAt` と違えば、その op は「画面を開いた後に変わりました」で失敗にする（ほかの op は続ける）
  - 比べる行: 在庫・買い物は `inventory_items` / `shopping_items` の行、レシピは `recipes` の行、献立は `plans` の行
  - レシピ: `updateRecipe` は材料・手順だけ変えるときも `recipes` の行を `set(values)` で更新するので、`$onUpdateFn` で `updated_at` が必ず変わる（#14 のテストで確かめる）
  - 献立: 上の表のとおり `replacePlanRecipes` で `plans.updated_at` も変える
  - 比べてから反映するまでの間に変わる競合は防がない（自分専用で、同時に 2 か所から操作することはほぼないため）
- 1 回の頼みで op は 20 件まで

### 実装（#14）

- 今日の日付は道具ではなくプロンプトに入れる（`## 今日`）
- Container の `POST /agent` は汎用にする: `{ prompt, readTools: [{ name, description, result | itemsById }], opTools: [{ name, description, inputSchema }] }` → `{ reply, calls: [{ tool, args }] }`。道具の中身（スナップショットとスキーマ）は Worker が毎回作るので、Container は道具の種類を知らない
  - `itemsById` の道具（`get_recipe`）は `{ id }` で引く。変更案の道具は 20 件まで記録する
- 変更案の道具名は `propose_inventory_add` のように `op` の `.` を `_` にして頭に `propose_` を付ける。`inputSchema` は `{ targetId?, input? }` で、`input` は既存の zod スキーマの入力側（`z.toJSONSchema(schema, { io: 'input' })`）
- Worker（`services/agent.ts`）は呼ばれた道具ごとに、知らない道具・対象がスナップショットにない・`input` が zod を通らない・同じ対象への 2 つ目の案（反映で必ず失敗するため。`shopping.add` は献立の行を変えないので除く）、の 4 つを捨てて `warnings` に書く。通ったものに `summary`（変更前はスナップショットの値）と `baseUpdatedAt` を付ける
- `baseUpdatedAt` はスナップショットを作るときに各行の `updated_at` を先に読んでおき、そこから入れる（エージェントの実行中に変わった行は、反映のときに「変わりました」で止まる）
- `recipe.create` は `sourceType = ai` で作る
- テストは `AI_PROVIDER=fake` の `FakeAgentRunner`（「使った」を含む頼みなら在庫の先頭を半分にする案）と、決まった道具を呼ぶだけのランナーで行う

### API

| メソッド | パス | 内容 |
|---|---|---|
| POST | `/api/agent/requests` | `{ instruction }`（500 文字まで）→ `AgentResult`。DB は変えない |
| POST | `/api/agent/apply` | `{ operations: AgentOperation[] }` → `{ results: { ok: boolean; error?: string }[] }`。上から順に 1 件ずつ反映 |

- `apply` は画面から来た op をそのまま信じない。op ごとに zod で検証し、`targetId` の行の存在と状態を確かめてから既存のサービスを呼ぶ（`/api/inventory` などを直接呼ぶのと同じ扱い）
- 同じ op を 2 回送られた場合: `add` / `create` は 2 件できてしまうので、画面は反映中にボタンを止め、反映後は一覧を消す。`update` 系は `baseUpdatedAt` で 2 回目が失敗する

### プライバシー（06 の変更）

「AI に頼む」では、エージェントが道具で在庫（量・期限・場所）、レシピ、買い物リスト、献立を読みます。本人の決定（エージェントにこれらを変えさせる）に伴い、AI に渡す範囲を広げます。次は今までどおり渡しません。

- 袋（meal_kits）、利用履歴、購入日
- 本人のメールアドレスなど Access の情報

### プロンプトインジェクション

レシピの本文（URL 取り込み由来）に「在庫を全部消して」のような文が混ざる可能性があります。変更案は必ず本人が確認してから反映し、袋・献立の確定と削除は道具にないので、被害は「おかしな変更案が出る」までに留まります。

## 開発とテスト

- テストは `AI_PROVIDER=fake`。「AI に頼む」も fake のエージェント（決まった op を返す）で API の流れをテストする
- Container のサーバは `container/` で単体テスト（道具が op を記録すること、`submit_result` の扱い）。SDK は差し替え可能にして、本物は呼ばない
- fake になるのは `AI_PROVIDER=fake` のときだけ。`AI_PROVIDER=cursor`（既定）なのに `AGENT` binding がなければ 503 `AI_NOT_CONFIGURED` にする（本番の設定漏れで、黙って偽の結果を返さないため。今の Gemini のキーがないときと同じ扱い）
- ローカル: `vite dev` では Container を動かさない。`.dev.vars` で `AI_PROVIDER=fake` を指定する（`.dev.vars.example` は今もそうなっている）。本物で試すときは `wrangler dev`（Docker が要る）
- デプロイ: `wrangler deploy` がイメージを作って上げるので、デプロイする場所（GitHub Actions）で Docker が使える必要がある（ubuntu の runner には入っている）

## 実装の順番

| # | PR | 内容 |
|---|---|---|
| 13 | Cursor プロバイダ | `container/`（Node + SDK、`/structured`、`/health`）、`AgentContainer`、`CursorProvider`、wrangler の設定、画面のタイムアウト 90 秒。コールドスタートと 1 回の時間・トークンを実測して、この設計書に書く |
| 14 | AI に頼む | 道具、`/agent`、`/api/agent/*`、S13、`replacePlanRecipes` で `plans.updated_at` を更新 |

本人にお願いすること: Cursor の User API key を作り、本番の Worker のシークレット `CURSOR_API_KEY` に入れる（手順は #13 の deploy 手順に書く）。
