# TaskAI 設計ドキュメント

## 1. 目的とスコープ

タスクと予定を管理するツール。中核は「Claude/ChatGPT のようにチャットすると、その内容に応じて Google カレンダーへ予定を追加・編集してくれる」体験。あわせてユーザーの体力・健康に配慮したアドバイスを行う。

- **フェーズ1（本MVP・実装済み）**: Google カレンダー連携 + チャットによる予定の作成/取得/更新/削除（繰り返し対応）。体力配慮アドバイス。
- **フェーズ2以降（未実装）**: Gmail 読み取り→予定提案、Slack 読み取り→予定提案、バックグラウンド自動取り込み、ToDo タスク管理。

## 2. 技術スタック

| 領域 | 採用 | 理由 |
|---|---|---|
| フレームワーク | Next.js 15 (App Router) + TypeScript | API ルートでサーバ側に秘密鍵・ツール実行を閉じ込められる |
| UI | React 19 + Tailwind CSS v4 | 高速にチャット UI を構築 |
| LLM | Claude / OpenAI / Gemini を切替可能（既定 `claude-haiku-4-5`） | プロバイダ抽象化レイヤで差し替え。UI から選択可 |
| カレンダー | `googleapis`（OAuth2 + Calendar v3） | 公式 SDK、トークン自動更新 |
| 永続化 | `better-sqlite3`（SQLite） | MVP はシンプルに。トークン・会話を保存 |
| セッション | `iron-session`（署名付き Cookie） | ユーザー識別 |
| テスト | Vitest | TS ネイティブで高速 |

## 3. ディレクトリ構成

```
src/
  app/
    layout.tsx, page.tsx          # page はサーバーコンポーネントでログイン出し分け
    api/
      auth/google/route.ts        # 同意画面へリダイレクト
      auth/callback/route.ts      # code→トークン交換→DB保存→Cookie発行
      auth/logout/route.ts
      chat/route.ts               # エージェントループを SSE でストリーミング
      events/route.ts             # アジェンダ用の直近予定取得
  lib/
    db.ts                         # SQLite 初期化 + users/conversations/messages
    session.ts                    # iron-session ラッパ
    google.ts                     # OAuth2 + Calendar クライアント（自動 refresh）
    calendar.ts                   # 予定 CRUD + 純粋関数（body 構築・正規化）
    tools.ts                      # Claude ツール定義 + 実行ディスパッチ
    claude.ts                     # system プロンプト + エージェントループ
  components/
    Chat.tsx                      # SSE 受信のチャット UI
    Agenda.tsx                    # 直近予定リスト
tests/                            # ユニット/インテグレーション
docs/DESIGN.md
```

## 4. データモデル（SQLite）

- **users**: `id, email(unique), access_token, refresh_token, expiry_date, created_at, updated_at`
  - `refresh_token` は再同意時のみ Google から返るため、upsert 時は `COALESCE` で既存値を保持。
- **conversations**: `id, user_id, title, created_at`（将来の履歴永続化用に用意）
- **messages**: `id, conversation_id, role, content, created_at`

現状チャット履歴はクライアント側が保持し、リクエストごとに送る。`conversations`/`messages` はフェーズ2で活用予定。

## 4.5 複数 Google アカウント連携

1つのログインセッションに複数の Google アカウントを連携し、カレンダーを横断して扱える。

- **セッション**: `userId`（主アカウント）+ `accountIds`（連携中の全アカウント、主を含む）。旧Cookie 互換のため `accountIdsOf()` で `userId` を補完。
- **追加フロー**: `/api/auth/google?add=1` → `prompt=consent select_account`・`state=add` で同意画面。callback は `state==="add"` かつログイン中なら**主を変えず** `accountIds` に追記、そうでなければ新規ログイン。
- **集約**: `CalendarContext = { accounts: CalendarAccount[] }`（`accounts[0]`=既定）。`listEventsForAccounts()` が全アカウントを並列取得し開始時刻でマージ、各予定に `accountEmail` を付与。
- **ツールのアカウント指定**: 各ツールに任意の `account`（メール）パラメータ。`list_events` は省略で全集約、指定でそのアカウントのみ。`create/update/delete` は指定アカウント（省略時は既定）。`update/delete` は対象予定の `accountEmail` を渡す運用（system プロンプトで明示）。
- **API**: `/api/accounts` が連携アカウント一覧を返す。`/api/events`・`/api/chat` は `accountIdsOf(session)` から `CalendarContext` を構築。
- **UI**: ヘッダと アジェンダに「＋アカウント追加」。アジェンダはアカウントごとに色バッジを付与（複数連携時）。

## 5. 認証フロー（Google OAuth 2.0）

```
ユーザー → /api/auth/google → Google 同意画面
  scope: openid, userinfo.email, calendar
  access_type=offline, prompt=consent  （refresh_token 取得のため）
Google → /api/auth/callback?code=...
  exchangeCodeForTokens(code): トークン交換 + userinfo でメール取得
  upsertUser(): users へ保存
  iron-session に userId/email を保存
  → / へリダイレクト
```

トークンの自動更新: `oauthClientForUser` で OAuth クライアントを復元し、`client.on("tokens", ...)` で googleapis が更新した access/refresh トークンを DB に書き戻す。

## 5.5 マルチプロバイダ抽象化（Claude / OpenAI / Gemini）

LLM 呼び出し部分のみをプロバイダごとに差し替え、**ツール定義・カレンダー実行・system プロンプトは全プロバイダ共通**で再利用する。

```
lib/llm/
  types.ts     # ProviderId, NeutralMessage, RunResult, ProviderRunParams
  index.ts     # runWithProvider(): 実クライアント生成 + ディスパッチ、defaultProviderId()
  openai.ts    # runOpenAI(): Chat Completions ループ
  gemini.ts    # runGemini(): @google/genai generateContent ループ
lib/claude.ts  # runAgent(): Claude(Anthropic) ループ（既存を流用）
```

- 共通入力 `ProviderRunParams = { calendar, system, history, onText?, onTool? }`。
- 各 `run*` は **LLM クライアントを引数で受ける**ため、テストで実 SDK をモック可能（`runAgent` と同じ DI 方針）。
- ツールは単一ソース `calendarTools`（Anthropic 形式 = JSON Schema）から各社形式へ変換:
  - OpenAI: `{type:"function", function:{name, description, parameters}}`
  - Gemini: `functionDeclarations:[{name, description, parameters}]`
- プロバイダ選択: リクエストボディ `provider`（UI のセレクタ）> 環境変数 `LLM_PROVIDER` > 既定 `claude`。
- モデルは env で上書き可（`ANTHROPIC_MODEL` 既定 `claude-haiku-4-5` / `OPENAI_MODEL` 既定 `gpt-4o-mini` / `GEMINI_MODEL` 既定 `gemini-2.5-flash`）。

各社のループ構造は同型: 「生成 → tool/function 呼び出しがあれば executeTool 実行 → 結果を各社形式（Anthropic=tool_result / OpenAI=role:tool / Gemini=functionResponse）で履歴に積んで継続 → 無ければ終了」。最大ターン数で無限ループ防止。

## 6. エージェントループ（中核・Claude）

`lib/claude.ts` の `runAgent` が Claude 用の実装。**Anthropic クライアントと Calendar クライアントを引数で受ける**ため、テストで両方モック可能。OpenAI/Gemini も同型のループを `lib/llm/{openai,gemini}.ts` に実装。

```
runAgent({ client, calendar, system, history, onText, onTool })
  loop (最大 MAX_TURNS=10):
    res = client.messages.create({ model, system, tools: calendarTools, messages })
    テキストブロック → onText でストリーミング
    messages に assistant 応答を追加
    if stop_reason !== "tool_use": break
    各 tool_use について executeTool(calendar, name, input) を実行
      成功 → tool_result
      失敗 → tool_result(is_error: true) で Claude に返し自己修復させる
    messages に tool_result(user) を追加
```

### ツール（`lib/tools.ts`）

| ツール | 役割 |
|---|---|
| `list_events(timeMin, timeMax, query?)` | 期間の予定取得（確認・対象特定） |
| `create_event(summary, start, end, description?, location?, attendees?, recurrence?)` | 作成。`recurrence` に RRULE（繰り返し） |
| `update_event(eventId, ...変更フィールド)` | 部分更新 |
| `delete_event(eventId)` | 削除（破壊的。事前確認を指示） |
| `find_places(query, near?, openNow?)` | 場所/カフェ検索（Google Places API）。カレンダー非依存 |
| 各カレンダーツール | 任意 `account`（対象アカウントのメール） |

各 description に「いつ呼ぶか」を明記（モデルのツール発火を安定させる）。

### 場所検索ツール（`lib/places.ts`）

カレンダー以外の「近くのカフェは？」等に応えるため、Google Places API (New) Text Search を `searchPlaces()`（`fetch` 注入可でテスト容易）でラップし `find_places` として全プロバイダ共通の toolset に追加。`executeTool` 冒頭で分岐し、カレンダー連携が無くても動く。`GOOGLE_MAPS_API_KEY` 必須。Wi-Fi/電源/混雑は取得不可のため system プロンプトで一般助言に委ねる。

### 繰り返し（RRULE）

「毎日」「毎週」「平日」などの自然言語を system プロンプトの指示で RRULE に変換。
- 毎日: `RRULE:FREQ=DAILY`
- 平日: `RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR`

これにより「毎日19時からAIの勉強を1時間」「毎日21時から事業戦略/ネットワークの勉強を1時間」といった定期学習ブロックを1操作で作成できる。

## 7. 体力・健康配慮ポリシー（system プロンプト）

`buildSystemPrompt` に明文化:

- 高負荷の予定を連続させない。間に休憩・軽作業を挟む提案。
- 夜遅い時間に集中力を要する作業を置かない。
- 1日の総負荷が高い場合は警告・再配置の提案。
- **お酒を含む会食が多い/連続するときは明確に注意・警告**し、翌日を軽めにする/間隔を空ける/頻度を抑える等を提案。
- 予定作成自体はユーザー意図を尊重し、助言は添えるが強制しない。

曖昧な日時は作成前に確認、削除前は対象を要約して確認、という安全側の指示も含む。

## 8. ストリーミング（SSE）

`/api/chat` は `ReadableStream` で SSE を返す。イベント種別:
- `text`: アシスタントの現在ターンのテキスト
- `tool`: 実行中のツール名（UI で「カレンダー操作中」表示）
- `done` / `error`

クライアント（`Chat.tsx`）は `\n\n` 区切りでパースして反映。

## 9. セキュリティ

- API キーと Google シークレットはサーバ専用（API ルート/lib のみ）。クライアントに渡さない。
- セッションは httpOnly Cookie（iron-session 署名）。`SESSION_SECRET` 必須。
- 各 API ルートは `session.userId` を確認し、未ログインは 401。
- `.env.local` と `*.sqlite` は `.gitignore` 済み。

## 10. テスト戦略

- **ユニット**（`tests/calendar.test.ts`, `tests/tools.test.ts`）: `buildEventBody`/`buildPatchBody`/`normalizeEvent` の変換、ツールディスパッチ（fake calendar クライアント）。RRULE がそのまま body に載ること等。
- **インテグレーション（Claude）**（`tests/agent.test.ts`）: `runAgent` を、tool_use→end_turn を返すモック Anthropic クライアントと fake calendar で駆動し、(1) ツールが実行される (2) tool_result が次ターンに渡る (3) 最終テキストが返る (4) ツールエラー時に is_error が返り自己修復ループが続く、を検証。
- **インテグレーション（OpenAI/Gemini）**（`tests/openai.test.ts`, `tests/gemini.test.ts`）: 各 SDK をモックし、function/tool 呼び出し→実行→各社形式の結果を履歴に積む→最終テキスト、および system/history/functionDeclarations の受け渡しを検証。
- **system プロンプト**（`tests/system-prompt.test.ts`）: 体力配慮・会食警告・繰り返しの指示文が含まれることを検証。

外部ネットワーク（Google/Anthropic）には接続しない。

## 11. 将来フェーズの設計メモ

- **Gmail/Slack 取り込み**: 読み取り→予定候補抽出（Claude）→ユーザー承認→ create_event。`conversations`/`messages` と提案テーブルを追加。
- **自動化**: cron（スケジュール実行）で受信を定期スキャン。
- **ToDo タスク**: カレンダーと別立てのタスクテーブル。締切→空き時間への自動配置で体力配慮ロジックを再利用。
