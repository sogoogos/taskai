import { describe, it, expect, vi } from "vitest";
import type { calendar_v3 } from "googleapis";
import {
  buildEventBody,
  buildPatchBody,
  normalizeEvent,
  aggregateEvents,
  DEFAULT_TIMEZONE,
  type CalendarAccount,
} from "@/lib/calendar";

describe("buildEventBody", () => {
  it("基本フィールドと既定タイムゾーンを反映する", () => {
    const body = buildEventBody({
      summary: "歯医者",
      start: "2026-06-15T15:00:00+09:00",
      end: "2026-06-15T16:00:00+09:00",
    });
    expect(body.summary).toBe("歯医者");
    expect(body.start).toEqual({
      dateTime: "2026-06-15T15:00:00+09:00",
      timeZone: DEFAULT_TIMEZONE,
    });
    expect(body.end?.timeZone).toBe(DEFAULT_TIMEZONE);
  });

  it("繰り返し(RRULE)と参加者をそのまま載せる", () => {
    const body = buildEventBody({
      summary: "AIの勉強",
      start: "2026-06-15T19:00:00+09:00",
      end: "2026-06-15T20:00:00+09:00",
      recurrence: ["RRULE:FREQ=DAILY"],
      attendees: ["a@example.com", "b@example.com"],
    });
    expect(body.recurrence).toEqual(["RRULE:FREQ=DAILY"]);
    expect(body.attendees).toEqual([
      { email: "a@example.com" },
      { email: "b@example.com" },
    ]);
  });
});

describe("buildPatchBody", () => {
  it("指定したフィールドだけを含める", () => {
    const body = buildPatchBody({ eventId: "e1", summary: "新タイトル" });
    expect(body).toEqual({ summary: "新タイトル" });
    expect(body.start).toBeUndefined();
    expect(body.end).toBeUndefined();
  });

  it("start を渡すとタイムゾーン込みで dateTime を設定する", () => {
    const body = buildPatchBody({ eventId: "e1", start: "2026-06-15T16:00:00+09:00" });
    expect(body.start).toEqual({
      dateTime: "2026-06-15T16:00:00+09:00",
      timeZone: DEFAULT_TIMEZONE,
    });
  });
});

describe("normalizeEvent", () => {
  it("時間指定イベントを正規化する", () => {
    const n = normalizeEvent({
      id: "e1",
      summary: "会議",
      start: { dateTime: "2026-06-15T10:00:00+09:00" },
      end: { dateTime: "2026-06-15T11:00:00+09:00" },
      location: "会議室",
      htmlLink: "https://cal/e1",
    });
    expect(n).toMatchObject({
      id: "e1",
      summary: "会議",
      allDay: false,
      start: "2026-06-15T10:00:00+09:00",
      location: "会議室",
    });
  });

  it("終日イベントは allDay=true になる", () => {
    const n = normalizeEvent({
      id: "e2",
      summary: "祝日",
      start: { date: "2026-06-15" },
      end: { date: "2026-06-16" },
    });
    expect(n.allDay).toBe(true);
    expect(n.start).toBe("2026-06-15");
  });

  it("summary 欠落時は (無題) になる", () => {
    const n = normalizeEvent({ id: "e3" });
    expect(n.summary).toBe("(無題)");
  });
});

describe("aggregateEvents エラー耐性", () => {
  function account(email: string, listImpl: () => Promise<unknown>): CalendarAccount {
    const calendar = {
      events: { list: vi.fn(listImpl) },
    } as unknown as calendar_v3.Calendar;
    return { email, calendar };
  }

  const params = {
    timeMin: "2026-06-15T00:00:00+09:00",
    timeMax: "2026-06-16T00:00:00+09:00",
  };

  it("一部アカウントが失敗しても成功分を返し、errors に記録する", async () => {
    const ok = account("ok@example.com", async () => ({
      data: { items: [{ id: "e1", summary: "会議", start: { dateTime: "2026-06-15T10:00:00+09:00" } }] },
    }));
    const ng = account("ng@example.com", async () => {
      throw new Error("Request had insufficient authentication scopes.");
    });

    const { events, errors } = await aggregateEvents([ok, ng], params);

    expect(events).toHaveLength(1);
    expect(events[0].accountEmail).toBe("ok@example.com");
    expect(errors).toHaveLength(1);
    expect(errors[0].email).toBe("ng@example.com");
    expect(errors[0].message).toMatch(/insufficient/);
  });
});
