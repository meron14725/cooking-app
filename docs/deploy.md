# デプロイと認証の初期設定

最初に 1 回だけ、Cloudflare と GitHub で次の設定をします。設定が終わるまでは、main にマージしてもデプロイはスキップされます（GitHub Actions の Deploy に notice が出ます）。

所要時間の目安は 15〜20 分です。

## 1. 本番 D1 を作る

Cloudflare ダッシュボード → **Storage & Databases → D1 SQL Database → Create**

- 名前: `cooking-app`
- 場所: 自動（または Asia-Pacific）

作成後に表示される **Database ID** を、`wrangler.jsonc` の `d1_databases[0].database_id` に入れて main にマージします（Claude に ID を伝えてもらえれば PR にします）。Database ID は秘密情報ではありません。

## 2. GitHub Actions 用の API トークンを作る

Cloudflare ダッシュボード → 右上のアカウント → **My Profile → API Tokens → Create Token → Create Custom Token**

| 項目 | 値 |
|---|---|
| Token name | `cooking-app GitHub Actions` |
| Permissions | Account / **Workers Scripts** / Edit |
| | Account / **D1** / Edit |
| | Account / **Workers R2 Storage** / Edit（レシピ写真と DB バックアップのバケット。既存のトークンに無ければ足す） |
| | Account / **Account Settings** / Read |
| Account Resources | Include / 自分のアカウント |

作ったトークンと、ダッシュボードの右側（または URL）に出ている **Account ID** を、GitHub のリポジトリに登録します。

GitHub → リポジトリの **Settings → Secrets and variables → Actions → New repository secret**

| Name | 値 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | 上で作ったトークン |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID |

登録したら、GitHub の **Actions → Deploy → Run workflow** で 1 回デプロイします。成功すると `https://cooking-app.<サブドメイン>.workers.dev` ができます。この時点では Access の設定がないので、開いても「認証の設定がされていません」と出ます（設定漏れのときは閉じる作りです）。

## 3. Cloudflare Access で自分だけ入れるようにする

Cloudflare ダッシュボード → **Workers & Pages → cooking-app → Settings → Domains & Routes**

1. `workers.dev` の行で **Enable Cloudflare Access** を押す
2. 表示される **Manage Cloudflare Access** から Access アプリケーションを開き、ポリシーを編集する
   - Action: Allow
   - Include: **Emails** に自分のメールアドレスを 1 件
   - ログイン方法: One-time PIN（メールに届くコード）
3. Access アプリケーションの画面で次の 2 つを控える
   - **Application Audience (AUD) Tag**
   - チームのドメイン（Zero Trust → Settings → Custom Pages などに出ている `<チーム名>.cloudflareaccess.com`）

控えた値を `wrangler.jsonc` の `vars` に入れて main にマージします（これも Claude に伝えてもらえれば PR にします）。AUD とチームドメインは秘密情報ではありません。

```jsonc
"vars": {
  "ACCESS_TEAM_DOMAIN": "<チーム名>.cloudflareaccess.com",
  "ACCESS_AUD": "<AUD タグ>"
}
```

## 4. AI（Cursor）の API キーを入れる

URL 取り込み・補完提案・カロリー推定は、Cursor SDK を Cloudflare Containers の中で動かして使います（[設計 08](./design/08-agent.md)）。

1. Cursor の [Dashboard → API Keys](https://cursor.com/dashboard/api) で **User API key** を作る（利用は自分のプランの枠から引かれる。Usage 画面に「SDK」タグで出る）
2. Worker のシークレットに入れる（リポジトリには入れない）

```sh
npx wrangler secret put CURSOR_API_KEY
```

- Container のイメージは `wrangler deploy`（GitHub Actions の Deploy）が `container/Dockerfile` から作って上げます。ubuntu の runner には Docker が入っているので追加の設定はいりません
- 初回のデプロイで Container の権限が足りないと言われたら、上の API トークンに Containers の編集権限を足してください（必要な権限名は未確認です）
- モデルの既定は `composer-2.5`。変えたいときは `wrangler.jsonc` の `vars` に `CURSOR_MODEL` を足します
- キーが入っていないと、AI のボタンは「AI の設定がありません」と出ます（ほかの機能は使えます）。使っていない Container は 10 分で止まり、次に使うときは起動を待つので、1 回目は少し遅くなります

### 予備: Gemini に戻す

`wrangler.jsonc` の `vars` に `"AI_PROVIDER": "gemini"` を足し、[Google AI Studio](https://aistudio.google.com/apikey) のキーを `npx wrangler secret put GEMINI_API_KEY` で入れます。

### まとめて推定のウェブ検索

まとめて推定は、既定で AI にウェブ検索をさせます（docs/design/06-ai.md「ウェブ検索」）。止めるときは `wrangler.jsonc` の `vars` に `"AI_WEB_SEARCH": "off"` を足します。出典の列は migration 0012 で足すので、デプロイの前に `npx wrangler d1 migrations apply cooking-app --remote` を流してください。Container の中身（`container/src`）も変わるので、デプロイで Container のイメージを作り直します。

## 5. 確認

- スマホで `https://cooking-app.<サブドメイン>.workers.dev` を開く → メールのコードでログイン → ホームに「API: OK」と出る
- シークレットウィンドウで開くと、ログイン画面が出る（自分のメール以外ではコードが届かない）

## まとめて推定のジョブ（Workflows）

「分類と価格をまとめて推定」は、Cloudflare Workflows のジョブでサーバー側で最後まで進めます（[設計 12](./design/12-estimate-jobs.md)）。

- `wrangler.jsonc` の `workflows`（`cooking-app-estimate`、binding `ESTIMATE_WORKFLOW`）を `wrangler deploy` が作るので、ダッシュボードでの作成はいりません
- ジョブの表は migration 0011（`estimate_jobs`）。`wrangler d1 migrations apply cooking-app --remote` を先に流します
- 初回のデプロイで Workflows の権限が足りないと言われたら、上の API トークンに Workflows の編集権限を足してください（必要な権限名は未確認です）

## レシピ写真（R2）

レシピの完成写真は R2 バケット `cooking-app-images` に置き、Worker の `GET /api/images/<キー>` からだけ返します（`/api` の下なので Access の内側。未ログインでは見えません）。写真も公式レシピのデータもリポジトリには入れません。

### 1. バケットを作る（一度だけ。デプロイより先に）

```sh
npx wrangler r2 bucket create cooking-app-images
```

`wrangler.jsonc` の `r2_buckets` がこのバケットを指しているので、バケットが無いと `wrangler deploy` が失敗することがあります。デプロイ（GitHub Actions）より先、遅くともデプロイの直前に作ってください。Actions のトークンに R2 の権限が無ければ、上の「2.」の表のとおり **Workers R2 Storage / Edit** を足します。

### 2. 写真を上げる

キーは `img/<レシピコード>.jpg`（例: `img/R4063.jpg`）です。手元のファイルを 1 枚ずつ上げます（上げるスクリプトはリポジトリに入れません）。

```sh
npx wrangler r2 object put cooking-app-images/img/R4063.jpg --file=./R4063.jpg --remote --content-type image/jpeg
```

### 3. レシピに写真と件数を付ける

`recipes` の `image_key`（上のキー）、`official_menu_no`（3 桁）、`favorite_count`、`cook_count`、`score` を D1 で UPDATE します。COCORO KITCHEN の URL から取り込んだレシピは、取り込みのときにこれらが下書きに入ります（写真のキーは決まりますが、写真そのものは 2. で上げます）。

### 補足

- 並べ替えは「人気順」= `favorite_count`、「よく作られる順」= `cook_count` の多い順です。`score` では並べません
- 画像の応答は `Cache-Control: private, max-age=86400`（ブラウザにだけ 1 日）。認証の後ろなので CDN の共有キャッシュや別の配信サービスは使いません
- 写真のキーがあってもまだ上がっていないときは、画面ではプレースホルダが出ます

## 本番 DB のバックアップ（R2・非公開）

Deploy はマイグレーションの前に本番 D1 を `wrangler d1 export` で書き出し、R2 バケット `cooking-app-backups` に保存します。キーは `d1/cooking-app-<UTC 日時>-<コミットの先頭 7 桁>.sql` です。

このリポジトリは公開なので、書き出した SQL を GitHub Actions の成果物（artifact）やログには出しません。成果物はログインしている人なら誰でもダウンロードでき、COCORO の公式レシピを含む本番 DB が漏れるためです（`.github/workflows/deploy.yml` に `upload-artifact` が無いことはテスト `scripts/deploy-workflow.test.ts` で確かめています）。

### 1. バケットを作る（一度だけ。次のデプロイより先に）

```sh
npx wrangler r2 bucket create cooking-app-backups
```

- 公開アクセスは**付けない**でください。作ったばかりのバケットは非公開です。ダッシュボードの **R2 → cooking-app-backups → Settings** で **Public Development URL** が Disabled、**Custom Domains** が空のままにします
- Worker からは使わないので、`wrangler.jsonc` の `r2_buckets` には足しません
- Actions のトークンには上の「2.」の **Workers R2 Storage / Edit** が要ります（写真のバケットと同じ権限です）
- バケットが無いと Deploy は「R2 バケット cooking-app-backups に保存できませんでした」で止まり、マイグレーションもデプロイもしません

### 2. 古いバックアップを自動で消す（任意）

30 日で消す例です。

```sh
npx wrangler r2 bucket lifecycle add cooking-app-backups expire-d1-backups d1/ --expire-days 30
```

### 3. 戻すとき

まず D1 Time Travel（過去 30 日の任意の時点、[設計 01](./design/01-architecture.md)「データの守り」）を検討します。SQL から戻すときは、手元に落として流します。書き出しには `CREATE TABLE` も入っているので、テーブルが残っている DB に流すと失敗します。空の DB に流してください。

```sh
npx wrangler r2 object get cooking-app-backups/d1/<キー>.sql --file ./backup.sql --remote
npx wrangler d1 execute cooking-app --remote --file ./backup.sql
```

落とした SQL は公式レシピを含むので、リポジトリに入れたり共有したりしないでください。

## 初期データについて

- マイグレーション `0001_seed_ingredients.sql`（食材）と `0002_seed_recipes.sql`（レシピ）は、本番に最初に流したときだけ入ります（同じ名前・同じ id は何もしない）
- レシピの材料は食材を**名前**で引いて入れます。`0002` を流す前に食材マスタの名前を変えたり削除したりすると、その材料の行は入りません。最初のデプロイで両方まとめて流れるので、通常は気にしなくて大丈夫です

## 入口について

- 入口は `*.workers.dev` の 1 つだけです。`wrangler.jsonc` で `preview_urls: false` にしているので、バージョンごとのプレビュー URL は作られません
- 将来カスタムドメインを使う場合は、そのドメインに Access をかけてから `workers_dev: false` にします
- Worker は Access の JWT（署名・aud・iss・有効期限）を検証するので、Access を通らない経路から偽のヘッダを付けてもアクセスできません

## ローカル開発

```sh
cp .dev.vars.example .dev.vars   # ENVIRONMENT=local で JWT 検証をスキップ、AI は fake
npm run dev
```

- `npm run dev`（vite）では Container を動かしません（`wrangler.jsonc` の `dev.enable_containers: false`）。AI は `.dev.vars` の `AI_PROVIDER=fake` で固定の下書きを返します
- 本物の Cursor で試すときは `.dev.vars` を `AI_PROVIDER=cursor` と `CURSOR_API_KEY=...` にして、Docker を起動した状態で `npm run build && npx wrangler dev`（`dev.enable_containers` を一時的に外す）
- ローカルの写真はローカルの R2 に上げます（`--local`）: `npx wrangler r2 object put cooking-app-images/img/R0001.jpg --file=./手元の画像.jpg --local --content-type image/jpeg`
