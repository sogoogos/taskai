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
    expect(p.strategy).toBeNull();
  });

  it("strategy(判定ロジック)を正規化する（indicators は重み降順、決済ルールは number/boolean 保持）", () => {
    const p = normalizeTradingPayload({
      summary: {},
      strategy: {
        name: "swing_composite",
        benchmark: "Nikkei 225",
        signal_threshold: 4,
        strong_signal_threshold: 7,
        indicators: [
          { key: "sma", weight: 1.5 },
          { key: "ml", weight: 3.0 },
          { key: "ichimoku", weight: 2.5 },
        ],
        params: { rsi_oversold: 30, rsi_overbought: 70, bad: "x" },
        buy_vetoes: ["ML 弱気は見送る", ""],
        exit_rules: { stop_loss_pct: 0.05, trailing_stop_enabled: true, max_hold_days: 30 },
        position_sizing: { position_size_pct: 0.1, max_positions: 5 },
        description: "合成スコア戦略",
      },
    });
    const s = p.strategy!;
    expect(s.name).toBe("swing_composite");
    expect(s.signalThreshold).toBe(4);
    expect(s.strongSignalThreshold).toBe(7);
    // 重み降順に並ぶ
    expect(s.indicators.map((i) => i.key)).toEqual(["ml", "ichimoku", "sma"]);
    // params は数値のみ（"bad" は捨てる）
    expect(s.params).toEqual({ rsi_oversold: 30, rsi_overbought: 70 });
    // 空文字の veto は除外
    expect(s.buyVetoes).toEqual(["ML 弱気は見送る"]);
    // boolean を保持
    expect(s.exitRules.trailing_stop_enabled).toBe(true);
    expect(s.exitRules.stop_loss_pct).toBe(0.05);
    expect(s.positionSizing.max_positions).toBe(5);
  });

  it("strategy.indicators が dict 形式でも配列化する", () => {
    const p = normalizeTradingPayload({
      summary: {},
      strategy: { name: "x", indicators: { rsi: 1.5, macd: 2.0 } },
    });
    expect(p.strategy!.indicators).toEqual([
      { key: "macd", weight: 2.0 },
      { key: "rsi", weight: 1.5 },
    ]);
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
