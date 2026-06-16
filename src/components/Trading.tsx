"use client";

import { useEffect, useState, useCallback } from "react";
import type { TradingPayload } from "@/lib/trading";

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
    </div>
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
