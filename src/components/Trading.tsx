"use client";

import { useEffect, useState, useCallback } from "react";
import type { TradingPayload, TradingStrategy, TradingSignal } from "@/lib/trading";

interface StatusItem {
  source: string;
  label: string | null;
  currency: string | null;
  payload: TradingPayload;
  updatedAt: number;
}

function money(sym: string, v: number): string {
  return `${sym}${Math.round(v).toLocaleString()}`;
}

function pctClass(v: number): string {
  return v > 0 ? "text-green-400" : v < 0 ? "text-red-400" : "text-[var(--muted)]";
}

function relTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "たった今";
  if (m < 60) return `${m}分前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}時間前`;
  return `${Math.floor(h / 24)}日前`;
}

export default function Trading({ reloadSignal = 0 }: { reloadSignal?: number }) {
  const [statuses, setStatuses] = useState<StatusItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/trading");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "取得に失敗しました");
      const list: StatusItem[] = data.statuses ?? [];
      // 表示順: 日本株(ライブ) → 日本株(ペーパー) → 米国株 → その他
      const ORDER: Record<string, number> = { live: 0, jp: 1, us: 2 };
      list.sort((a, b) => (ORDER[a.source] ?? 99) - (ORDER[b.source] ?? 99));
      setStatuses(list);
      setActive((cur) => cur ?? list[0]?.source ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, reloadSignal]);

  const current = statuses.find((s) => s.source === active) ?? statuses[0];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 市場切替 */}
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
        <div className="flex min-w-0 flex-wrap gap-1">
          {statuses.map((s) => (
            <button
              key={s.source}
              onClick={() => setActive(s.source)}
              className={
                "rounded-full px-2.5 py-0.5 text-xs font-medium transition " +
                (current?.source === s.source
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--muted)] hover:bg-[var(--surface-2)]")
              }
            >
              {s.label ?? s.source}
            </button>
          ))}
        </div>
        <button
          onClick={load}
          className="shrink-0 rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)] transition hover:bg-[var(--surface-2)]"
        >
          更新
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {loading && <p className="text-xs text-[var(--muted)]">読み込み中…</p>}
        {error && <p className="text-xs text-red-400">{error}</p>}
        {!loading && !error && statuses.length === 0 && (
          <div className="space-y-2 text-xs text-[var(--muted)]">
            <p>取引状況のデータがまだありません。</p>
            <p>
              kabu-trader（EC2）からの定期送信を待っています。送信設定が済むと、ここに市場ごとの評価額・保有銘柄・損益が表示されます。
            </p>
          </div>
        )}

        {current && <MarketView item={current} />}
      </div>
    </div>
  );
}

function MarketView({ item }: { item: StatusItem }) {
  const sym = item.currency ?? "";
  const p = item.payload;
  const s = p.summary;

  return (
    <div className="space-y-3">
      {/* サマリー */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--muted)]">評価額</span>
          <span className="flex items-center gap-1.5">
            {p.isLive ? (
              <span className="rounded-full bg-red-500/20 px-1.5 py-0.5 text-[10px] font-medium text-red-400">
                LIVE 実弾
              </span>
            ) : (
              <span className="rounded-full bg-[var(--surface)] px-1.5 py-0.5 text-[10px] text-[var(--muted)]">
                ペーパー
              </span>
            )}
            <span className="text-[10px] text-[var(--muted)]">{relTime(item.updatedAt)}</span>
          </span>
        </div>
        <div className="mt-0.5 flex items-baseline gap-2">
          <span className="text-2xl font-bold">{money(sym, s.totalValue)}</span>
          <span className={"text-sm font-semibold " + pctClass(s.totalReturnPct)}>
            {s.totalReturnPct >= 0 ? "+" : ""}
            {s.totalReturnPct.toFixed(2)}%
          </span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
          <Stat label="現金" value={money(sym, s.cash)} />
          <Stat
            label="確定損益"
            value={`${s.totalPnl >= 0 ? "+" : ""}${money(sym, s.totalPnl)}`}
            cls={pctClass(s.totalPnl)}
          />
          <Stat
            label="勝率"
            value={`${Math.round(s.winRate)}% (${s.winningTrades}/${s.totalClosedTrades})`}
          />
        </div>
      </div>

      {/* 保有銘柄 */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-semibold">保有銘柄</span>
          <span className="text-[10px] text-[var(--muted)]">{s.openPositions} 銘柄</span>
        </div>
        {p.positions.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">保有なし</p>
        ) : (
          <div className="space-y-1">
            {p.positions.map((pos) => (
              <div
                key={pos.ticker}
                className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5"
              >
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium">
                    {pos.ticker}
                    {pos.name ? <span className="ml-1 text-[var(--muted)]">{pos.name}</span> : null}
                  </div>
                  <div className="text-[10px] text-[var(--muted)]">
                    {pos.shares}株 ・ {money(sym, pos.entryPrice)}→{money(sym, pos.currentPrice)}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className={"text-xs font-semibold " + pctClass(pos.pnl)}>
                    {pos.pnlPct >= 0 ? "+" : ""}
                    {pos.pnlPct.toFixed(1)}%
                  </div>
                  <div className={"text-[10px] " + pctClass(pos.pnl)}>
                    {pos.pnl >= 0 ? "+" : ""}
                    {money(sym, pos.pnl)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 現在のシグナル */}
      <SignalsView signals={p.signals} signalsAt={p.signalsAt} />

      {/* 直近の売買 */}
      {p.trades.length > 0 && (
        <div>
          <span className="text-xs font-semibold">直近の売買</span>
          <div className="mt-1 space-y-0.5">
            {p.trades
              .slice(-8)
              .reverse()
              .map((t, i) => (
                <div
                  key={`${t.timestamp}-${t.ticker}-${i}`}
                  className="flex items-center gap-2 text-[11px]"
                >
                  <span className="w-20 shrink-0 text-[var(--muted)]">
                    {t.timestamp.slice(5, 10)}
                  </span>
                  <span
                    className={
                      "w-9 shrink-0 font-semibold " +
                      (t.action === "BUY" ? "text-green-400" : "text-red-400")
                    }
                  >
                    {t.action === "BUY" ? "買" : "売"}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{t.ticker}</span>
                  {t.action === "SELL" && t.pnlPct !== undefined && (
                    <span className={pctClass(t.pnl ?? 0)}>
                      {(t.pnlPct ?? 0) >= 0 ? "+" : ""}
                      {(t.pnlPct ?? 0).toFixed(1)}%
                    </span>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* 判定ロジック */}
      {p.strategy && <StrategyView strategy={p.strategy} />}
    </div>
  );
}

// 指標キー → 日本語ラベル
const INDICATOR_LABEL: Record<string, string> = {
  sma: "移動平均(SMA)",
  rsi: "RSI",
  macd: "MACD",
  bollinger: "ボリンジャー",
  volume: "出来高",
  ichimoku: "一目均衡表",
  mfi: "MFI(資金流入)",
  adx: "ADX(トレンド強度)",
  relative_strength: "相対強度",
  ml: "ML予測",
  sentiment: "ニュース感情",
  earnings: "決算サプライズ",
  sector_spillover: "同業決算波及",
  accumulation: "出来高蓄積",
};

// 決済ルールキー → 日本語ラベル
const EXIT_LABEL: Record<string, string> = {
  stop_loss_pct: "損切り",
  take_profit_pct: "利確",
  trailing_stop_enabled: "トレーリングストップ",
  trailing_stop_activate_pct: "トレーリング発動",
  trailing_stop_distance_pct: "トレーリング幅",
  max_hold_days: "最大保有日数",
  rotation_enabled: "ローテーション",
  rotation_max_pnl_pct: "ローテーション閾値",
  rotation_min_hold_hours: "ローテーション最短保有",
  reentry_cooldown_days: "再エントリー待機",
};

// 0〜1 の小数は % 表記、それ以外はそのまま
function exitValue(key: string, v: number | boolean): string {
  if (typeof v === "boolean") return v ? "有効" : "無効";
  if (key.endsWith("_pct") && Math.abs(v) <= 1) return `${(v * 100).toFixed(1)}%`;
  if (key.includes("days")) return `${v}日`;
  if (key.includes("hours")) return `${v}時間`;
  return String(v);
}

// シグナル種別 → 見た目
const SIGNAL_UI: Record<string, { label: string; cls: string; buy: boolean }> = {
  STRONG_BUY: { label: "強い買い", cls: "bg-green-500/20 text-green-400", buy: true },
  BUY: { label: "買い", cls: "bg-green-500/10 text-green-400", buy: true },
  SELL: { label: "売り", cls: "bg-red-500/10 text-red-400", buy: false },
  STRONG_SELL: { label: "強い売り", cls: "bg-red-500/20 text-red-400", buy: false },
};

function signalTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return relTime(d.getTime());
}

function SignalRow({ s }: { s: TradingSignal }) {
  const ui = SIGNAL_UI[s.signal] ?? { label: s.signal, cls: "text-[var(--muted)]", buy: false };
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 truncate text-xs font-medium">
          {s.ticker}
          {s.name ? <span className="ml-1 text-[var(--muted)]">{s.name}</span> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className={"rounded-full px-1.5 py-0.5 text-[10px] font-semibold " + ui.cls}>
            {ui.label}
          </span>
          <span className="text-[10px] text-[var(--muted)]">スコア {s.score > 0 ? "+" : ""}{s.score}</span>
        </div>
      </div>
      {s.reasons.length > 0 && (
        <div className="mt-0.5 truncate text-[10px] text-[var(--muted)]" title={s.reasons.join(" / ")}>
          {s.reasons.slice(0, 3).join(" / ")}
        </div>
      )}
    </div>
  );
}

// 折りたたみ前に見せる件数（買い/売りそれぞれ）
const SIGNAL_PREVIEW = 5;

function SignalGroup({ label, cls, signals }: { label: string; cls: string; signals: TradingSignal[] }) {
  const [showAll, setShowAll] = useState(false);
  if (signals.length === 0) return null;
  const visible = showAll ? signals : signals.slice(0, SIGNAL_PREVIEW);
  const hidden = signals.length - visible.length;
  return (
    <div className="space-y-1">
      <div className={"text-[10px] font-medium " + cls}>
        {label} {signals.length}件
      </div>
      {visible.map((s) => (
        <SignalRow key={s.ticker} s={s} />
      ))}
      {signals.length > SIGNAL_PREVIEW && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="w-full rounded-lg border border-[var(--border)] py-1 text-[10px] text-[var(--muted)] transition hover:bg-[var(--surface-2)]"
        >
          {showAll ? "折りたたむ" : `他 ${hidden} 件を表示`}
        </button>
      )}
    </div>
  );
}

function SignalsView({ signals, signalsAt }: { signals: TradingSignal[]; signalsAt: string | null }) {
  const buys = signals.filter((s) => (SIGNAL_UI[s.signal]?.buy ?? false)).sort((a, b) => b.score - a.score);
  const sells = signals.filter((s) => !(SIGNAL_UI[s.signal]?.buy ?? true)).sort((a, b) => a.score - b.score);
  const when = signalTime(signalsAt);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold">現在のシグナル</span>
        {when && <span className="text-[10px] text-[var(--muted)]">{when}時点</span>}
      </div>
      {signals.length === 0 ? (
        <p className="text-xs text-[var(--muted)]">今はシグナルが出ていません（または monitor 未送信）。</p>
      ) : (
        <div className="space-y-2">
          <SignalGroup label="買い" cls="text-green-400" signals={buys} />
          <SignalGroup label="売り" cls="text-red-400" signals={sells} />
        </div>
      )}
    </div>
  );
}

function StrategyView({ strategy }: { strategy: TradingStrategy }) {
  const top = strategy.indicators.slice(0, 6);
  return (
    <details className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
      <summary className="cursor-pointer text-xs font-semibold">
        判定ロジック（BUY/SELL の決め方）
      </summary>
      <div className="mt-2 space-y-2 text-[11px] text-[var(--muted)]">
        <p className="leading-relaxed text-[var(--text)]">
          {strategy.indicators.length}指標を各 −1〜+1 で採点し重み付けして合算。合計の絶対値が{" "}
          <b>{strategy.signalThreshold}</b> 以上で BUY/SELL、
          <b>{strategy.strongSignalThreshold}</b> 以上で強い BUY/SELL。
        </p>

        <div>
          <div className="mb-0.5 font-medium text-[var(--text)]">主な指標（重み順）</div>
          <div className="flex flex-wrap gap-1">
            {top.map((ind) => (
              <span
                key={ind.key}
                className="rounded-full bg-[var(--surface)] px-2 py-0.5"
                title={`重み ${ind.weight}`}
              >
                {INDICATOR_LABEL[ind.key] ?? ind.key} ×{ind.weight}
              </span>
            ))}
          </div>
        </div>

        {strategy.buyVetoes.length > 0 && (
          <div>
            <div className="mb-0.5 font-medium text-[var(--text)]">買いを見送る条件</div>
            <ul className="list-disc space-y-0.5 pl-4">
              {strategy.buyVetoes.map((v, i) => (
                <li key={i}>{v}</li>
              ))}
            </ul>
          </div>
        )}

        {Object.keys(strategy.exitRules).length > 0 && (
          <div>
            <div className="mb-0.5 font-medium text-[var(--text)]">決済ルール</div>
            <div className="grid grid-cols-2 gap-1">
              {Object.entries(strategy.exitRules).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-1 rounded-md bg-[var(--surface)] px-2 py-1">
                  <span>{EXIT_LABEL[k] ?? k}</span>
                  <span className="text-[var(--text)]">{exitValue(k, v)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </details>
  );
}

function Stat({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="rounded-lg bg-[var(--surface)] px-2 py-1.5">
      <div className="text-[10px] text-[var(--muted)]">{label}</div>
      <div className={"mt-0.5 font-medium " + (cls ?? "")}>{value}</div>
    </div>
  );
}
