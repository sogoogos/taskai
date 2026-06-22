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
                 "shares": 100, "pnl": -5000, "pnl_pct": -0.5, "reason": "stop_loss" }],
    "strategy": { "name": "swing_composite", "benchmark": "Nikkei 225",
                  "signal_threshold": 4, "strong_signal_threshold": 7,
                  "indicators": [{ "key": "ml", "weight": 3.0 }, { "key": "ichimoku", "weight": 2.5 }],
                  "params": { "rsi_oversold": 30, "rsi_overbought": 70 },
                  "buy_vetoes": ["ML弱気は見送る", "買われすぎは見送る"],
                  "exit_rules": { "stop_loss_pct": 0.05, "take_profit_pct": 0.15,
                                  "trailing_stop_enabled": true, "max_hold_days": 30 },
                  "position_sizing": { "position_size_pct": 0.1, "max_positions": 5 } },
    "signals_at": "2026-06-22T14:30:00+09:00",
    "signals": [{ "ticker": "2371.T", "name": "カカクコム", "signal": "BUY", "score": 5,
                  "price": 3400, "reasons": ["MACD bullish crossover", "RSI oversold (28.0)"] }]
  }
}
```

`payload` は `src/lib/trading.ts` の `normalizeTradingPayload` で正規化されるため、snake_case / camelCase どちらでも、欠損があっても安全に取り込めます。

## 判定ロジック（strategy）の表示

`payload.strategy` は kabu-trader の BUY/SELL 判定ロジックの概要で、`scripts/push_taskai.py` の `build_strategy()` が config（`strategy.params` と `backtest`）から組み立てて送ります。これにより、TaskAI のチャットで「kabu-trader はどう売買を判定してる?」「損切りラインは?」と聞くと `get_trading_status` の `strategy` を読んで説明できます（投資タブにも「判定ロジック」の折りたたみで表示）。

- 骨子: 14 指標を各 −1〜+1 で採点 → 重み付けして合算 → 絶対値が `signal_threshold` 以上で BUY/SELL、`strong_signal_threshold` 以上で強い BUY/SELL。`buy_vetoes`（ML 弱気・買われすぎ）の新規買いは見送る。決済は `exit_rules`（損切り/利確/トレーリング/最大保有日数）。
- strategy 未送信（旧バージョンの push）なら `null` になり、チャットは「kabu-trader 側が未送信」と案内します。

## 現在のシグナル（signals）の取り込み

`payload.signals` はウォッチリスト各銘柄の「現在の」売買シグナル（HOLD は除く）です。push 自身は再計算しません（全銘柄の OHLCV 取得は重く cron に不向き）。代わりに **24/7 稼働する monitor が `_analyze_signals()` のたびに `state_dir/signals.json` へスナップショットを書き出し**、push がそれを読んで同梱します。

```
monitor (5分間隔) ── _analyze_signals → state_dir/signals.json（原子的に書換）
push_taskai (cron) ── signals.json を読む → payload.signals / signals_at
```

- シグナルの鮮度は monitor の周期（既定 `monitor.interval_seconds=300`＝5分）と push の周期に依存します。`signals_at`（算出時刻）を必ず添えて鮮度を判断します。
- monitor が動いていない／`state_dir` 未設定なら `signals` は空配列になり、チャット・投資タブは「今はシグナルなし、または未送信」と案内します。
- チャットで「今どの銘柄に BUY/SELL シグナルが出てる?」と聞くと、`get_trading_status` の `signals` から BUY系/SELL系に分けて回答します（投資タブにも「現在のシグナル」を表示）。

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
