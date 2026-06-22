/**
 * 投資（スイング取引）状況の共有型。
 * EC2 の kabu-trader が get_summary 等から組み立てて push し、TaskAI が表示する。
 */

export interface TradingSummary {
  initialCapital: number;
  cash: number;
  positionsValue: number;
  totalValue: number;
  totalReturnPct: number;
  openPositions: number;
  totalClosedTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnl: number;
  daysRunning: number;
}

export interface TradingPosition {
  ticker: string;
  name: string;
  shares: number;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPct: number;
  entryDate: string; // YYYY-MM-DD
}

export interface TradingTrade {
  timestamp: string;
  action: string; // BUY / SELL
  ticker: string;
  name: string;
  price: number;
  shares: number;
  pnl?: number;
  pnlPct?: number;
  reason?: string;
}

/** BUY/SELL の判定ロジック概要。kabu-trader が config から組み立てて送る。 */
export interface TradingStrategyIndicator {
  key: string; // 指標キー（sma/rsi/macd/ichimoku/ml/sentiment ...）
  weight: number; // 合成スコアへの重み
}

export interface TradingStrategy {
  name: string; // 例 swing_composite
  benchmark: string | null; // 相対強度の基準（例 Nikkei 225）
  signalThreshold: number; // |スコア| がこれ以上で BUY/SELL
  strongSignalThreshold: number; // これ以上で STRONG_BUY/SELL
  indicators: TradingStrategyIndicator[]; // 重み付き指標（重み降順）
  params: Record<string, number>; // 主要パラメータ（sma_short, rsi_oversold ...）
  buyVetoes: string[]; // BUY を見送る条件（人間可読）
  exitRules: Record<string, number | boolean>; // 損切り/利確/トレーリング/最大保有日数 等
  positionSizing: Record<string, number>; // position_size_pct, max_positions 等
  description: string | null; // 任意の人間可読サマリ
}

/** ウォッチリスト各銘柄の「現在の」売買シグナル（monitor が定期計算）。 */
export interface TradingSignal {
  ticker: string;
  name: string;
  signal: string; // STRONG_BUY / BUY / SELL / STRONG_SELL（HOLD は含まない）
  score: number; // 合成スコア（+で買い寄り / -で売り寄り）
  price: number; // 判定時の価格
  reasons: string[]; // 寄与した指標の説明
}

export interface TradingPayload {
  isLive: boolean;
  summary: TradingSummary;
  positions: TradingPosition[];
  trades: TradingTrade[]; // 直近のみ
  strategy: TradingStrategy | null; // BUY/SELL 判定ロジック（未送信なら null）
  signals: TradingSignal[]; // 現在出ている売買シグナル（monitor 未送信なら空）
  signalsAt: string | null; // シグナルの算出時刻（ISO8601）
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

/** snake_case / camelCase どちらのキーでも引ける */
function get(o: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) if (o[k] !== undefined) return o[k];
  return undefined;
}

/** 数値だけを残す浅いレコード化（混入した非数値は捨てる） */
function numberRecord(v: unknown): Record<string, number> {
  if (!v || typeof v !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    const n = typeof val === "number" ? val : Number(val);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
}

/** number/boolean を残すレコード化（損切り等は両方混じる） */
function scalarRecord(v: unknown): Record<string, number | boolean> {
  if (!v || typeof v !== "object") return {};
  const out: Record<string, number | boolean> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === "boolean") out[k] = val;
    else {
      const n = typeof val === "number" ? val : Number(val);
      if (Number.isFinite(n)) out[k] = n;
    }
  }
  return out;
}

/**
 * 判定ロジック概要を正規化する。indicators は {key:weight} の dict でも
 * [{key,weight}] の配列でも受け取り、重み降順の配列に揃える。
 */
function normalizeStrategy(raw: unknown): TradingStrategy | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const indRaw = get(o, "indicators");
  let indicators: TradingStrategyIndicator[] = [];
  if (Array.isArray(indRaw)) {
    indicators = (indRaw as Record<string, unknown>[])
      .map((x) => ({ key: str(get(x, "key", "name")), weight: num(get(x, "weight")) }))
      .filter((x) => x.key);
  } else if (indRaw && typeof indRaw === "object") {
    indicators = Object.entries(indRaw as Record<string, unknown>).map(([key, w]) => ({
      key,
      weight: num(w),
    }));
  }
  indicators.sort((a, b) => b.weight - a.weight);

  const vetoesRaw = get(o, "buy_vetoes", "buyVetoes");
  const buyVetoes = Array.isArray(vetoesRaw)
    ? (vetoesRaw as unknown[]).map(str).filter(Boolean)
    : [];

  const desc = get(o, "description");

  return {
    name: str(get(o, "name")) || "strategy",
    benchmark: get(o, "benchmark") !== undefined ? str(get(o, "benchmark")) : null,
    signalThreshold: num(get(o, "signal_threshold", "signalThreshold")),
    strongSignalThreshold: num(get(o, "strong_signal_threshold", "strongSignalThreshold")),
    indicators,
    params: numberRecord(get(o, "params")),
    buyVetoes,
    exitRules: scalarRecord(get(o, "exit_rules", "exitRules")),
    positionSizing: numberRecord(get(o, "position_sizing", "positionSizing")),
    description: desc !== undefined ? str(desc) : null,
  };
}

/**
 * 受信した任意 JSON を TradingPayload に正規化する。
 * EC2 側は snake_case で送ってくる想定だが camelCase も許容する。
 */
export function normalizeTradingPayload(raw: unknown): TradingPayload {
  const o = (raw ?? {}) as Record<string, unknown>;
  const s = (o.summary ?? {}) as Record<string, unknown>;
  const pick = (a: string, b: string) => (s[a] !== undefined ? s[a] : s[b]);

  const summary: TradingSummary = {
    initialCapital: num(pick("initial_capital", "initialCapital")),
    cash: num(s.cash),
    positionsValue: num(pick("positions_value", "positionsValue")),
    totalValue: num(pick("total_value", "totalValue")),
    totalReturnPct: num(pick("total_return_pct", "totalReturnPct")),
    openPositions: num(pick("open_positions", "openPositions")),
    totalClosedTrades: num(pick("total_closed_trades", "totalClosedTrades")),
    winningTrades: num(pick("winning_trades", "winningTrades")),
    losingTrades: num(pick("losing_trades", "losingTrades")),
    winRate: num(pick("win_rate", "winRate")),
    totalPnl: num(pick("total_pnl", "totalPnl")),
    daysRunning: num(pick("days_running", "daysRunning")),
  };

  const positions: TradingPosition[] = Array.isArray(o.positions)
    ? (o.positions as Record<string, unknown>[]).map((p) => ({
        ticker: str(p.ticker),
        name: str(p.name),
        shares: num(p.shares),
        entryPrice: num(p.entry_price ?? p.entryPrice),
        currentPrice: num(p.current_price ?? p.currentPrice ?? p.price),
        pnl: num(p.pnl),
        pnlPct: num(p.pnl_pct ?? p.pnlPct),
        entryDate: str(p.entry_date ?? p.entryDate).slice(0, 10),
      }))
    : [];

  const trades: TradingTrade[] = Array.isArray(o.trades)
    ? (o.trades as Record<string, unknown>[]).map((t) => ({
        timestamp: str(t.timestamp),
        action: str(t.action),
        ticker: str(t.ticker),
        name: str(t.name),
        price: num(t.price),
        shares: num(t.shares),
        pnl: t.pnl !== undefined ? num(t.pnl) : undefined,
        pnlPct: t.pnl_pct !== undefined || t.pnlPct !== undefined ? num(t.pnl_pct ?? t.pnlPct) : undefined,
        reason: t.reason !== undefined ? str(t.reason) : undefined,
      }))
    : [];

  const strategy = normalizeStrategy(o.strategy);

  const signals: TradingSignal[] = Array.isArray(o.signals)
    ? (o.signals as Record<string, unknown>[]).map((x) => ({
        ticker: str(x.ticker),
        name: str(x.name),
        signal: str(x.signal),
        score: num(x.score),
        price: num(x.price),
        reasons: Array.isArray(x.reasons) ? (x.reasons as unknown[]).map(str).filter(Boolean) : [],
      }))
    : [];
  const signalsAtRaw = get(o, "signals_at", "signalsAt");
  const signalsAt = signalsAtRaw ? str(signalsAtRaw) : null;

  return {
    isLive: Boolean(o.is_live ?? o.isLive),
    summary,
    positions,
    trades,
    strategy,
    signals,
    signalsAt,
  };
}
