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

## 4. AI の API キーを入れる

URL 取り込みとカロリー推定で Gemini API を使います。

1. [Google AI Studio](https://aistudio.google.com/apikey) で API キーを作る
2. Worker のシークレットに入れる（リポジトリには入れない）

```sh
npx wrangler secret put GEMINI_API_KEY
```

- 使うモデルは `src/server/ai/gemini.ts` の既定値です。変えたいときは `wrangler.jsonc` の `vars` に `GEMINI_MODEL` を足します
- キーが入っていないと、取り込みと推定のボタンは「AI の API キーが設定されていません」と出ます（ほかの機能は使えます）

## 5. 確認

- スマホで `https://cooking-app.<サブドメイン>.workers.dev` を開く → メールのコードでログイン → ホームに「API: OK」と出る
- シークレットウィンドウで開くと、ログイン画面が出る（自分のメール以外ではコードが届かない）

## 初期データについて

- マイグレーション `0001_seed_ingredients.sql`（食材）と `0002_seed_recipes.sql`（レシピ）は、本番に最初に流したときだけ入ります（同じ名前・同じ id は何もしない）
- レシピの材料は食材を**名前**で引いて入れます。`0002` を流す前に食材マスタの名前を変えたり削除したりすると、その材料の行は入りません。最初のデプロイで両方まとめて流れるので、通常は気にしなくて大丈夫です

## 入口について

- 入口は `*.workers.dev` の 1 つだけです。`wrangler.jsonc` で `preview_urls: false` にしているので、バージョンごとのプレビュー URL は作られません
- 将来カスタムドメインを使う場合は、そのドメインに Access をかけてから `workers_dev: false` にします
- Worker は Access の JWT（署名・aud・iss・有効期限）を検証するので、Access を通らない経路から偽のヘッダを付けてもアクセスできません

## ローカル開発

```sh
cp .dev.vars.example .dev.vars   # ENVIRONMENT=local で JWT 検証をスキップ
npm run dev
```
