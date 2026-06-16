# 投資（スイング取引）状況の取り込み

TaskAI の「投資」タブは、別プロジェクト **kabu-trader**（EC2 上で 24/7 稼働する自動売買システム）の運用状況を表示します。

## 仕組み（プッシュ方式）

TaskAI は Vercel（サーバーレス）上にあり、EC2 へ SSH/ポーリングするのは不安定です。そこで **EC2 側から TaskAI へ HTTPS で push** します（EC2 のアウトバウンドのみ・ファイアウォール変更不要）。

```
EC2: kabu-trader                         Vercel: TaskAI                  Turso
 cron → push_taskai.py  ──POST──▶  /api/trading/ingest  ──upsert──▶  trading_status
   （各市場の get_summary を送信）      (Bearer 認証)                       │
                                                                          ▼
ブラウザ ◀── 投資タブ / チャット get_trading_status ◀── GET /api/trading ◀┘
```

- 市場（`source`）ごとに最新スナップショット1件を upsert（履歴は保持しない）。
- 認証は共有トークン `TRADING_INGEST_TOKEN`（`Authorization: Bearer <token>`）。

## エンドポイント

| メソッド | パス | 用途 | 認証 |
|---|---|---|---|
| POST | `/api/trading/ingest` | 取引状況の受け口（EC2 が送信） | `Bearer TRADING_INGEST_TOKEN` |
| GET | `/api/trading` | 全市場の最新状況（UI が取得） | ログインセッション |

送信 body:

```json
{
  "source": "live",
  "label": "日本株(ライブ)",
  "currency": "¥",
  "payload": {
    "is_live": true,
    "summary": { "initial_capital": 1000000, "cash": 178872, "total_value": 1189000,
                 "total_return_pct": 18.9, "open_positions": 2, "total_closed_trades": 8,
                 "winning_trades": 5, "losing_trades": 3, "win_rate": 62, "total_pnl": 23000,
                 "days_running": 10 },
    "positions": [{ "ticker": "2371.T", "name": "...", "shares": 100, "entry_price": 3332,
                    "current_price": 3500, "pnl": 16800, "pnl_pct": 5.0, "entry_date": "2026-06-05" }],
    "trades": [{ "timestamp": "2026-06-10 14:00", "action": "SELL", "ticker": "...", "price": 0,
                 "shares": 100, "pnl": -5000, "pnl_pct": -0.5, "reason": "stop_loss" }]
  }
}
```

`payload` は `src/lib/trading.ts` の `normalizeTradingPayload` で正規化されるため、snake_case / camelCase どちらでも、欠損があっても安全に取り込めます。

## セットアップ

### 1. TaskAI 側（このリポジトリ）

- ローカル: `.env.local` に `TRADING_INGEST_TOKEN=...`（生成: `openssl rand -hex 24`）
- 本番: Vercel のプロジェクト設定 → Environment Variables に同じ `TRADING_INGEST_TOKEN` を追加して再デプロイ。

### 2. kabu-trader 側（EC2）

`scripts/push_taskai.py`（kabu-trader リポジトリ）が `get_summary` から payload を組み立てて送信します。

```bash
# EC2 にデプロイ
ssh kabu-ec2 'cd ~/kabu-trader && git pull'

# 環境変数（~/.bashrc 等 or cron 行内で）
export TASKAI_INGEST_URL=https://taskai.busystems.com/api/trading/ingest
export TASKAI_INGEST_TOKEN=<TaskAI と同じトークン>

# 手動送信テスト（市場ごと）
python3 -m scripts.push_taskai -c config/default.json --source jp   --label "日本株(ペーパー)"
python3 -m scripts.push_taskai -c config/live.json    --source live --label "日本株(ライブ)"
python3 -m scripts.push_taskai -c config/us.json      --source us   --label "米国株"
```

cron 例（平日のみ・市場時間帯に 30 分間隔。`crontab -e`）:

```cron
TASKAI_INGEST_URL=https://taskai.busystems.com/api/trading/ingest
TASKAI_INGEST_TOKEN=xxxxxxxx
*/30 0-14 * * 1-5  cd /home/ec2-user/kabu-trader && /usr/bin/python3 -m scripts.push_taskai -c config/default.json --source jp   --label "日本株(ペーパー)" >> /tmp/taskai_push.log 2>&1
*/30 0-14 * * 1-5  cd /home/ec2-user/kabu-trader && /usr/bin/python3 -m scripts.push_taskai -c config/live.json    --source live --label "日本株(ライブ)"  >> /tmp/taskai_push.log 2>&1
*/30 13-23 * * 1-5 cd /home/ec2-user/kabu-trader && /usr/bin/python3 -m scripts.push_taskai -c config/us.json      --source us   --label "米国株"        >> /tmp/taskai_push.log 2>&1
```

> 時刻は EC2 のタイムゾーン基準。UTC 運用なら JST=UTC+9 で読み替えること（上の例は UTC 想定で JST 9–24 時頃をカバー）。
