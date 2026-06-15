import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "@/lib/claude";

describe("buildSystemPrompt", () => {
  const sys = buildSystemPrompt({
    now: new Date("2026-06-14T12:00:00+09:00"),
    email: "user@example.com",
  });

  it("現在日時とユーザーを含む", () => {
    expect(sys).toContain("現在日時");
    expect(sys).toContain("user@example.com");
    expect(sys).toContain("Asia/Tokyo");
  });

  it("繰り返し(RRULE)の指示を含む", () => {
    expect(sys).toContain("RRULE:FREQ=DAILY");
    expect(sys).toContain("recurrence");
  });

  it("体力・健康配慮の指示を含む", () => {
    expect(sys).toContain("体力");
    expect(sys).toMatch(/連続させない/);
  });

  it("お酒を含む会食の警告指示を含む", () => {
    expect(sys).toContain("会食");
    expect(sys).toMatch(/注意|警告/);
  });

  it("削除など破壊的操作の確認指示を含む", () => {
    expect(sys).toMatch(/削除/);
    expect(sys).toMatch(/確認/);
  });

  it("宣言で終わらず実行しきる指示を含む", () => {
    expect(sys).toMatch(/やり切る|宣言だけ/);
  });

  it("プロフィール（自宅住所・状況メモ）を渡すと反映される", () => {
    const withProfile = buildSystemPrompt({
      now: new Date("2026-06-15T12:00:00+09:00"),
      email: "user@example.com",
      homeAddress: "東京都中央区銀座6-6-1",
      note: "移動は基本電車",
    });
    expect(withProfile).toContain("自宅住所: 東京都中央区銀座6-6-1");
    expect(withProfile).toContain("移動は基本電車");
    expect(withProfile).toContain("travel_time");
  });
});
