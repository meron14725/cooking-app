# 12. まとめて推定のジョブ

「分類と価格をまとめて推定」（09・10・11 の段）は、画面が API を何度も呼んで進める作りだったので、画面を離れると止まっていました。これをサーバー側のジョブにして、画面を閉じても最後まで進むようにします。段ごとの処理（`src/server/services/attributes.ts` の `estimateAttributes`）はそのまま使います。

## Workflows を使う（Queues ではなく）

| | Workflows | Queues |
|---|---|---|
| 1 回分の失敗のリトライ | `step.do` の設定（回数・間隔・指数バックオフ）だけで済む | メッセージの再配信で回るが、「次の 1 回」を自分で送り直す必要がある |
| 途中まで進んだ状態 | 終わった step の結果が残り、落ちても続きから進む | 自分で D1 に持つ |
| 止める | インスタンスの `terminate()` がある | 止める仕組みがなく、D1 の旗を毎回見るしかない |
| 状態の確認 | インスタンスの `status()` で、落ちた・消えたを見分けられる | 見分けにくい |
| 設定 | `wrangler.jsonc` に 1 つ足すだけ | キューの作成と consumer の設定が要る |

1 つのジョブを「AI に limit 件聞く 1 回分」を何十回か繰り返して進める形なので、手順の決まった長い処理に向く Workflows を選びます。

## ジョブの表（`estimate_jobs`、migration 0011）

| 列 | 内容 |
|---|---|
| `id` | ULID。Workflow のインスタンス ID と同じ |
| `status` | `running`（実行中）/ `done`（完了）/ `stopped`（止めた）/ `failed`（失敗） |
| `refresh_stale_prices` | 「古い目安を見直す」で始めたか |
| `progress` | 段（`ingredients` / `storage` / `prices` / `recipes`）ごとの `{ updated, remaining }`（JSON）。updated はジョブ全体の合計、remaining は最後の 1 回のあとの残り |
| `rounds` | 何回分進めたか |
| `error` | 失敗の理由 |
| `finished_at` | 終わった日時 |

- `status = 'running'` の部分 UNIQUE インデックスで、実行中のジョブは 1 つまでにする

## API

| API | 内容 |
|---|---|
| `POST /api/recipes/attributes/jobs` `{ limit?, refreshStalePrices? }` | ジョブを作り、Workflow を始めて 202 でジョブを返す。実行中があれば 409 `JOB_RUNNING`。Workflow の binding がなければ 503 `JOB_NOT_CONFIGURED` |
| `GET /api/recipes/attributes/jobs/current` | いちばん新しいジョブ（`{ job: EstimateJob \| null }`） |
| `POST /api/recipes/attributes/jobs/:id/stop` | 止める。D1 を先に `stopped` にしてから、インスタンスを `terminate()` する |

- `POST /api/recipes/attributes/estimate`（1 回分だけ進める）は、スクリプトとテスト向けに残す。画面は使わない
- `GET current` は、D1 では実行中なのに Workflow のインスタンスが終わっている（`errored` / `terminated` / `complete` / 見つからない）ときは、`failed` にして返す。実行中のまま残ると次のジョブを始められなくなるため
  - インスタンスの状態が分からない（見つからない以外の読み失敗、または Workflow が `unknown` を返す）ときは実行中のまま返す。ただし行の `updated_at` が `STALE_JOB_MS`（60 分。1 回分は時間切れ 10 分 × 4 回と待ち時間で 45 分ほどかかりうる）より古ければ止まったとみなして `failed` にする。Workflow が `running` などを返すあいだは古くても失敗にしない
  - `updated_at` は回を進めるたび（件数を足すとき）と終わったときに進む

## Workflow の中身（`EstimateWorkflow` → `runEstimateJob`）

1 回分ごとに次の 2 つの step を進める（最大 `MAX_ROUNDS = 300` 回）。

1. `round-N`: D1 のジョブがまだ `running` か見る（止めていたらここで終わり）。`estimateAttributes` を 1 回呼ぶ。「古い目安を見直す」は N = 0 のときだけ
2. `record-N`: 直した件数を足し、残りを入れる（件数を足すのを AI の呼び出しと分け、リトライで二重に足さない）

- 全段の残りが 0 になったら `done`
- step のリトライは 3 回まで（20 秒から指数バックオフ）。AI の設定がないなど、やり直しても同じ失敗は `NonRetryableError` ですぐ失敗にする（`isPermanentJobError`: `AI_NOT_CONFIGURED` と 4xx）。Cursor の Container が code なしの 503 を返したときは起動中・不調として `AI_UNAVAILABLE` にし、リトライする
- リトライしてもだめなら `failed` にし、理由を `error` に入れる。それまでに保存した推定と件数は残る
- 終わらせるときは `WHERE status = 'running'` を付け、止めたジョブを完了や失敗で上書きしない

## 画面

- 「その他」画面のパネルは、`GET current` を読んで出すだけにする。実行中のあいだは 2 秒ごとに読み直す
- 開き直すと、実行中のジョブの進み具合が見える。実行中は「止める」だけを出す
- 実行中なのに `updated_at` が `STUCK_HINT_MS`（10 分）より古ければ「しばらく進んでいません。…止めてからもう一度始めてください」と出す。止める（D1 を `stopped` にする）は、固まったジョブでもインスタンスの状態に関係なく効くので、止めればすぐ新しく始められる
- ジョブが終わったら、レシピ・食材・提案を読み直す
- 「古い目安を見直す」は `refreshStalePrices: true` でジョブを作る（同じ仕組み）

## テスト

- Node のテストでは `cloudflare:workers` を読めないので、Workflow のクラスは薄くして `runEstimateJob` に中身を寄せる。`src/server/testing/workflow.ts` の偽物の Workflow が、`create` で `runEstimateJob` を裏で走らせ、step.do をその場でリトライする
