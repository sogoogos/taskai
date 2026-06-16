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

export interface TradingPayload {
  isLive: boolean;
  summary: TradingSummary;
  positions: TradingPosition[];
  trades: TradingTrade[]; // 直近のみ
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
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

  return { isLive: Boolean(o.is_live ?? o.isLive), summary, positions, trades };
}
