# デプロイ手順（Vercel + Turso、無料）

スマホからも使えるように、**Vercel（無料 Hobby）＋ Turso（無料・SQLite互換DB）**へ公開する手順です。固定費は基本 $0（AI/地図APIの従量分は別）。

## 全体像
1. Turso で本番DBを作る（無料）
2. Vercel に GitHub リポジトリを接続してデプロイ
3. Vercel に環境変数を設定
4. Google OAuth に本番URLのリダイレクトを追加
5. スマホでアクセス＆ログイン

---

## 1. Turso（本番DB）

1. https://turso.tech でサインアップ（GitHubで可）
2. CLI もしくはダッシュボードでDBを作成
   - CLI例:
     ```bash
     brew install tursodatabase/tap/turso
     turso auth login
     turso db create taskai
     turso db show taskai --url        # → libsql://taskai-xxx.turso.io（TURSO_DATABASE_URL）
     turso db tokens create taskai     # → eyJ...（TURSO_AUTH_TOKEN）
     ```
3. 取得した **URL** と **トークン**を控える（手順3で使う）

> スキーマはアプリ起動時に自動作成されるので、手動のテーブル作成は不要。

## 2. Vercel にデプロイ

1. https://vercel.com でサインアップ（GitHubで）
2. 「Add New… → Project」→ GitHub の `sogoogos/taskai` を Import
3. Framework は自動で Next.js。**そのまま Deploy**（最初は環境変数なしで失敗してもOK、次で設定）

## 3. 環境変数（Vercel → Project → Settings → Environment Variables）

| 変数 | 値 |
|---|---|
| `LLM_PROVIDER` | `gemini`（使うプロバイダ） |
| `GEMINI_API_KEY` | あなたのキー |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuthクライアント |
| `GOOGLE_REDIRECT_URI` | `https://<あなたのアプリ>.vercel.app/api/auth/callback` |
| `GOOGLE_MAPS_API_KEY` | 場所/移動時間用（任意） |
| `SESSION_SECRET` | `openssl rand -base64 32` で生成 |
| `TURSO_DATABASE_URL` | 手順1のURL（`libsql://…`） |
| `TURSO_AUTH_TOKEN` | 手順1のトークン |

設定後、Deployments で **Redeploy**。

> `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` は使うときだけ設定。

## 4. Google OAuth に本番リダイレクトを追加

> ⚠️ **重要: `*.vercel.app` では Google ログインが通りません。**
> Google OAuth はカレンダー等の機微スコープを共有ドメイン（`vercel.app` のような公開サフィックス）で許可せず、`Error 400: invalid_request`（"doesn't comply with Google's OAuth 2.0 policy"）になります。
> **自分が所有する独自ドメインが必須**です（年数百円〜）。下記は独自ドメイン前提です。
>
> 手順:
> 1. ドメインを取得（Porkbun / Cloudflare 等）
> 2. Vercel → プロジェクト → **Domains** に追加し、DNS を設定（Valid Configuration になるまで）
> 3. このあとのリダイレクトURI・`GOOGLE_REDIRECT_URI` は、その独自ドメインを使う
> 4. OAuth クライアントから `*.vercel.app` のリダイレクトURIは**削除**する（無効な承認済みドメインとして残ると弾かれ続ける）


1. [Google Cloud → 認証情報](https://console.cloud.google.com/apis/credentials) → OAuthクライアント（ウェブ）
2. **承認済みのリダイレクト URI** に追加:
   ```
   https://<あなたのアプリ>.vercel.app/api/auth/callback
   ```
   （ローカル用の `http://localhost:3000/api/auth/callback` は残してOK）
3. OAuth 同意画面が「テスト中」なら、使う Google アカウントを**テストユーザー**に追加

> `GOOGLE_REDIRECT_URI`（Vercel側）と、ここに登録するURIは**完全一致**させること。

## 5. スマホで使う

`https://<あなたのアプリ>.vercel.app` をスマホのブラウザで開く → Google ログイン → 利用。ホーム画面に追加すればアプリのように使えます。

---

## 注意点（無料運用のコツ）

- **関数の実行時間制限**: Hobby は1リクエスト最大60秒ほど。「今週分まとめて埋めて」等の大量作成は時間がかかりタイムアウトすることがある。単発操作は問題なし。安定させたいなら Pro（最大300秒）か、依頼を分割する。
- **DBはローカルと別**: 本番(Turso)はローカルの `data/taskai.sqlite` とは別物。本番では初回にアカウント連携・プロフィール設定をやり直す。
- **秘密情報**: キー類は Vercel の環境変数にのみ置く（`.env.local` はコミットされない）。pre-commit フックで実キーの混入も防止済み。
- **Hobby は個人・非商用向け**。商用利用は Pro。
