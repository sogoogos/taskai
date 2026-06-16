// in-memory libSQL を使うため、import より前に環境変数を設定
process.env.TURSO_DATABASE_URL = ":memory:";

import { describe, it, expect } from "vitest";
import { normalizeTradingPayload } from "@/lib/trading";
import { upsertTradingStatus, listTradingStatus } from "@/lib/db";
import { executeTool } from "@/lib/tools";

describe("normalizeTradingPayload", () => {
  it("kabu-trader の snake_case ペイロードを正規化する", () => {
    const raw = {
      is_live: true,
      summary: {
        initial_capital: 1000000,
        cash: 129186,
        positions_value: 870814,
        total_value: 999999,
        total_return_pct: -0.0001,
        open_positions: 3,
        total_closed_trades: 30,
        winning_trades: 18,
        losing_trades: 12,
        win_rate: 60,
        total_pnl: 12345,
        days_running: 42,
      },
      positions: [
        {
          ticker: "2371.T",
          name: "カカクコム",
          shares: 100,
          entry_price: 3335,
          current_price: 3400,
          pnl: 6500,
          pnl_pct: 1.95,
          entry_date: "2026-05-01 10:00:00",
        },
      ],
      trades: [
        { timestamp: "2026-06-10 14:00", action: "SELL", ticker: "9984.T", name: "SBG", price: 9000, shares: 100, pnl: -5000, pnl_pct: -0.5, reason: "stop" },
      ],
    };
    const p = normalizeTradingPayload(raw);
    expect(p.isLive).toBe(true);
    expect(p.summary.cash).toBe(129186);
    expect(p.summary.winRate).toBe(60);
    expect(p.positions[0].entryPrice).toBe(3335);
    expect(p.positions[0].entryDate).toBe("2026-05-01");
    expect(p.trades[0].action).toBe("SELL");
    expect(p.trades[0].pnlPct).toBe(-0.5);
  });

  it("欠損フィールドは 0/空に埋める", () => {
    const p = normalizeTradingPayload({});
    expect(p.summary.totalValue).toBe(0);
    expect(p.positions).toEqual([]);
    expect(p.trades).toEqual([]);
    expect(p.isLive).toBe(false);
  });
});

describe("trading_status DB", () => {
  it("source ごとに upsert され、更新が新しい順で返る", async () => {
    await upsertTradingStatus({
      source: "jp",
      label: "日本株(ペーパー)",
      currency: "¥",
      payload: normalizeTradingPayload({ summary: { total_value: 100 } }),
    });
    await upsertTradingStatus({
      source: "us",
      label: "米国株",
      currency: "$",
      payload: normalizeTradingPayload({ summary: { total_value: 200 } }),
    });
    // jp を更新（最新になる）
    await upsertTradingStatus({
      source: "jp",
      label: "日本株(ペーパー)",
      currency: "¥",
      payload: normalizeTradingPayload({ summary: { total_value: 150 } }),
    });

    const list = await listTradingStatus();
    expect(list).toHaveLength(2); // upsert なので jp は重複しない
    expect(list[0].source).toBe("jp"); // 最後に更新した jp が先頭
    const jp = list.find((s) => s.source === "jp")!;
    expect((jp.payload as { summary: { totalValue: number } }).summary.totalValue).toBe(150);
  });
});

describe("executeTool get_trading_status", () => {
  it("保存済みの状況を返す（連携・userId 不要）", async () => {
    await upsertTradingStatus({
      source: "live",
      label: "日本株(ライブ)",
      currency: "¥",
      payload: normalizeTradingPayload({ is_live: true, summary: { total_value: 1178872 } }),
    });
    const ctx = { accounts: [] } as never;
    const result = (await executeTool(ctx, "get_trading_status", {})) as {
      statuses: { source: string }[];
    };
    expect(result.statuses.some((s) => s.source === "live")).toBe(true);
  });
});
