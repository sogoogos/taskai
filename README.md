# TaskAI

チャットするだけで Google カレンダーに予定を追加・編集できるツール。**Claude / OpenAI / Gemini** を切り替えてツール呼び出しで予定を操作し、体力にも配慮してアドバイスします。

- 「毎日19時からAIの勉強を1時間入れて」→ 毎日の繰り返し予定を作成
- 「今週の予定を教えて」→ 予定一覧
- 「歯医者を明日16時に変更して」「その予定を消して」→ 更新・削除（削除は確認あり）
- 会食（特に飲酒）が続くときなどは注意を促します
- **複数の Google アカウント**を連携し、カレンダーを横断して閲覧・操作（ヘッダの「＋アカウント追加」）
- **場所/カフェ検索**（find_places）：「この予定の近くでカフェ」等に対応（Google Places API、`GOOGLE_MAPS_API_KEY` 設定時）
- **移動時間**（travel_time）：車/徒歩/自転車は所要時間を計算（Google Routes API）。電車は Google マップの経路リンクを返す（日本の電車経路は API 非対応のため）。要 `GOOGLE_MAPS_API_KEY`
- **プロフィール設定**（ヘッダの⚙）：自宅住所・状況メモを登録するとアシスタントが考慮（移動時間の出発地や負荷判断に利用）
- **Gmail から予定取り込み**（search_emails）：「メールから予定を拾って」で、メールを読んで予定候補を抽出→確認のうえ追加（要 Gmail 閲覧許可。既存ユーザーは**再ログイン**で許可）
- **予定クリックで編集・削除**：リスト/タイムラインの予定をタップして詳細編集
- **日別タイムライン**：右パネルの「タイムライン」タブで、選んだ日の予定を時間軸表示（現在時刻の線つき）

設計の詳細は [docs/DESIGN.md](docs/DESIGN.md)、スマホからも使える公開手順は [docs/DEPLOY.md](docs/DEPLOY.md)（Vercel + Turso・無料）を参照。

## セットアップ

### 1. 依存インストール

```bash
npm install
```

### 2. Google OAuth クライアントの作成

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成
2. 「API とサービス」→「ライブラリ」で **Google Calendar API** を有効化
3. 「OAuth 同意画面」を構成（External 可）。テストユーザーに自分の Google アカウントを追加
4. 「認証情報」→「OAuth クライアント ID」→ 種類 **ウェブアプリケーション** を作成
   - 承認済みのリダイレクト URI に `http://localhost:3000/api/auth/callback` を登録
5. クライアント ID とシークレットを控える

### 3. 環境変数

`.env.example` をコピーして `.env.local` を作り、値を埋める。

```bash
cp .env.example .env.local
# SESSION_SECRET は次で生成
openssl rand -base64 32
```

| 変数 | 説明 |
|---|---|
| `LLM_PROVIDER` | 既定プロバイダ（`claude` / `openai` / `gemini`）。UI からも切替可 |
| `ANTHROPIC_API_KEY` | [Anthropic Console](https://console.anthropic.com) の API キー（Claude 使用時） |
| `OPENAI_API_KEY` | [OpenAI Platform](https://platform.openai.com) の API キー（OpenAI 使用時） |
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com) の API キー（Gemini 使用時・無料枠あり） |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | 手順2で作成した値 |
| `GOOGLE_REDIRECT_URI` | `http://localhost:3000/api/auth/callback` |
| `GOOGLE_MAPS_API_KEY` | 場所検索ツール用（任意）。Google Cloud で「Places API (New)」を有効化し API キーを作成 |
| `SESSION_SECRET` | Cookie 署名用（32文字以上） |

使いたいプロバイダのキーだけ設定すればOK（3つ全部は不要）。画面上部の「AIモデル」セレクタで会話ごとに切り替えられます。各モデルは `ANTHROPIC_MODEL` / `OPENAI_MODEL` / `GEMINI_MODEL` で上書き可能（既定: `claude-haiku-4-5` / `gpt-4o-mini` / `gemini-2.5-flash`）。

### 4. 起動

```bash
npm run dev
```

`http://localhost:3000` を開き「Google でログイン」→ チャットで予定を操作。

## 秘密情報の取り扱い

- 実キーは必ず `.env.local`（gitignore 済み）にのみ置く。`.env.example` は見本専用でプレースホルダのみ。
- `npm install` 時に秘密検知の pre-commit フック（`.githooks/pre-commit`）が有効化され、実キーらしき値のコミットをブロックします（回避は `git commit --no-verify`）。

## テスト

```bash
npm test          # 一回実行
npm run test:watch
```

ユニット（予定変換・ツール）とインテグレーション（エージェントループ、Google/Anthropic はモック）を含みます。

## スタック

Next.js 16 (App Router) / TypeScript / Tailwind v4 / `@anthropic-ai/sdk` / `openai` / `@google/genai` / `googleapis` / `@libsql/client`(Turso) / `iron-session` / Vitest

## ロードマップ

- フェーズ1（本MVP）: Google カレンダー連携 + チャットで予定操作
- フェーズ2: Gmail 読み取り → 予定候補の提案・追加
- フェーズ3: Slack 読み取り → 同上
- フェーズ4: バックグラウンド自動取り込み（cron）、ToDo タスク管理
