import { describe, it, expect } from "vitest";
import { parseRecurrence, nextOccurrence, describeRecurrence } from "@/lib/recurrence";

describe("parseRecurrence", () => {
  it("RRULE: 接頭辞あり/なしどちらも解釈する", () => {
    expect(parseRecurrence("RRULE:FREQ=DAILY")?.freq).toBe("DAILY");
    expect(parseRecurrence("FREQ=WEEKLY;BYDAY=MO,WE")?.byDay).toEqual([1, 3]);
  });
  it("未対応・空は null", () => {
    expect(parseRecurrence("")).toBeNull();
    expect(parseRecurrence(null)).toBeNull();
    expect(parseRecurrence("FREQ=HOURLY")).toBeNull();
  });
  it("INTERVAL / BYMONTHDAY を拾う", () => {
    const r = parseRecurrence("RRULE:FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=25");
    expect(r).toMatchObject({ freq: "MONTHLY", interval: 2, byMonthDay: 25 });
  });
});

describe("nextOccurrence", () => {
  it("毎日は翌日", () => {
    expect(nextOccurrence("RRULE:FREQ=DAILY", "2026-06-22")).toBe("2026-06-23");
  });
  it("N日ごと", () => {
    expect(nextOccurrence("RRULE:FREQ=DAILY;INTERVAL=3", "2026-06-22")).toBe("2026-06-25");
  });
  it("毎月25日（給与振込期限）は翌月25日", () => {
    expect(nextOccurrence("RRULE:FREQ=MONTHLY;BYMONTHDAY=25", "2026-06-25")).toBe("2026-07-25");
  });
  it("毎月（曜日指定なし）は同じ日付の翌月、月末はクランプ", () => {
    expect(nextOccurrence("RRULE:FREQ=MONTHLY", "2026-01-31")).toBe("2026-02-28");
  });
  it("年跨ぎ（12月→翌年1月）", () => {
    expect(nextOccurrence("RRULE:FREQ=MONTHLY;BYMONTHDAY=25", "2026-12-25")).toBe("2027-01-25");
  });
  it("毎週（曜日なし）は7日後", () => {
    expect(nextOccurrence("RRULE:FREQ=WEEKLY", "2026-06-22")).toBe("2026-06-29");
  });
  it("毎週 月・水（2026-06-22は月曜）→ 次は水曜", () => {
    expect(nextOccurrence("RRULE:FREQ=WEEKLY;BYDAY=MO,WE", "2026-06-22")).toBe("2026-06-24");
  });
  it("毎年は翌年同月日", () => {
    expect(nextOccurrence("RRULE:FREQ=YEARLY", "2026-06-22")).toBe("2027-06-22");
  });
  it("繰り返しなし/不正は null", () => {
    expect(nextOccurrence(null, "2026-06-22")).toBeNull();
    expect(nextOccurrence("RRULE:FREQ=DAILY", "bad-date")).toBeNull();
  });
});

describe("describeRecurrence", () => {
  it("日本語ラベル", () => {
    expect(describeRecurrence("RRULE:FREQ=MONTHLY;BYMONTHDAY=25")).toBe("毎月25日");
    expect(describeRecurrence("RRULE:FREQ=DAILY")).toBe("毎日");
    expect(describeRecurrence("RRULE:FREQ=WEEKLY;BYDAY=MO,WE")).toBe("毎週月・水");
    expect(describeRecurrence("RRULE:FREQ=DAILY;INTERVAL=3")).toBe("3日ごと");
    expect(describeRecurrence(null)).toBeNull();
  });
});
