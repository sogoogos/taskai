import { describe, it, expect, vi, afterEach } from "vitest";
import { calendarTools, executeTool } from "@/lib/tools";
import { makeFakeCalendar } from "./helpers/fakeCalendar";

describe("calendarTools 定義", () => {
  it("7つのツール（カレンダー4 + 場所 + 移動時間 + メール）が定義されている", () => {
    const names = calendarTools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "create_event",
        "delete_event",
        "find_places",
        "list_events",
        "search_emails",
        "travel_time",
        "update_event",
      ].sort(),
    );
  });

  it("各ツールに input_schema が定義されている", () => {
    for (const t of calendarTools) {
      expect(t.input_schema.type).toBe("object");
    }
  });
});

describe("executeTool ディスパッチ", () => {
  it("list_events は events.list を期間付きで呼び accountEmail を付与する", async () => {
    const { ctx, list } = makeFakeCalendar({
      list: [{ id: "e1", summary: "会議", start: { dateTime: "2026-06-15T10:00:00+09:00" } }],
      email: "me@example.com",
    });
    const result = await executeTool(ctx, "list_events", {
      timeMin: "2026-06-15T00:00:00+09:00",
      timeMax: "2026-06-16T00:00:00+09:00",
    });
    expect(list).toHaveBeenCalledOnce();
    expect(list.mock.calls[0][0]).toMatchObject({
      calendarId: "primary",
      singleEvents: true,
    });
    const events = result as { accountEmail?: string }[];
    expect(events.length).toBe(1);
    expect(events[0].accountEmail).toBe("me@example.com");
  });

  it("create_event は recurrence を requestBody に載せて insert する", async () => {
    const { ctx, insert } = makeFakeCalendar({
      insert: { id: "new-1", summary: "AIの勉強", recurrence: ["RRULE:FREQ=DAILY"] },
    });
    const result = (await executeTool(ctx, "create_event", {
      summary: "AIの勉強",
      start: "2026-06-15T19:00:00+09:00",
      end: "2026-06-15T20:00:00+09:00",
      recurrence: ["RRULE:FREQ=DAILY"],
    })) as { accountEmail?: string };
    const body = insert.mock.calls[0][0].requestBody;
    expect(body.summary).toBe("AIの勉強");
    expect(body.recurrence).toEqual(["RRULE:FREQ=DAILY"]);
    expect(result.accountEmail).toBe("me@example.com");
  });

  it("update_event は変更フィールドのみで patch する", async () => {
    const { ctx, patch } = makeFakeCalendar();
    await executeTool(ctx, "update_event", {
      eventId: "e1",
      start: "2026-06-15T16:00:00+09:00",
    });
    const args = patch.mock.calls[0][0];
    expect(args.eventId).toBe("e1");
    expect(args.requestBody.start.dateTime).toBe("2026-06-15T16:00:00+09:00");
    expect(args.requestBody.summary).toBeUndefined();
  });

  it("delete_event は events.delete を呼び結果を返す", async () => {
    const { ctx, del } = makeFakeCalendar();
    const result = await executeTool(ctx, "delete_event", { eventId: "e1" });
    expect(del).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ deleted: true, eventId: "e1" });
  });

  it("未知のツールは例外を投げる", async () => {
    const { ctx } = makeFakeCalendar();
    await expect(executeTool(ctx, "unknown_tool", {})).rejects.toThrow(
      /未知のツール/,
    );
  });

  it("search_emails: Gmail未連携ならエラー", async () => {
    const { ctx } = makeFakeCalendar(); // gmail なし
    await expect(executeTool(ctx, "search_emails", { query: "x" })).rejects.toThrow(
      /Gmail が未連携/,
    );
  });

  it("search_emails: gmail クライアントで検索する", async () => {
    const list = vi.fn(async () => ({ data: { messages: [{ id: "m1" }] } }));
    const get = vi.fn(async () => ({
      data: {
        snippet: "テスト",
        payload: {
          headers: [{ name: "Subject", value: "予約" }],
          mimeType: "text/plain",
          body: { data: Buffer.from("6/20 19:00", "utf8").toString("base64") },
        },
      },
    }));
    const fakeGmail = { users: { messages: { list, get } } };
    const base = makeFakeCalendar({ email: "me@example.com" });
    const ctx = { accounts: [{ ...base.ctx.accounts[0], gmail: fakeGmail }] } as never;

    const result = (await executeTool(ctx, "search_emails", { query: "予約" })) as {
      account: string;
      emails: { subject: string }[];
    };
    expect(list).toHaveBeenCalledOnce();
    expect(result.account).toBe("me@example.com");
    expect(result.emails[0].subject).toBe("予約");
  });
});

describe("executeTool find_places", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GOOGLE_MAPS_API_KEY;
  });

  it("アカウント連携が無くても場所検索は動く", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "K";
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        places: [{ displayName: { text: "近所のカフェ" }, formattedAddress: "銀座" }],
      }),
      text: async () => "",
    }));
    vi.stubGlobal("fetch", fetchMock);

    const emptyCtx = { accounts: [] };
    const result = (await executeTool(emptyCtx, "find_places", {
      query: "カフェ",
      near: "銀座6-6-1",
    })) as { name: string }[];

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result[0].name).toBe("近所のカフェ");
  });
});

describe("executeTool 複数アカウント", () => {
  it("list_events は account 省略で全アカウントを集約する", async () => {
    const a = makeFakeCalendar({
      email: "a@example.com",
      list: [{ id: "ea", summary: "A会議", start: { dateTime: "2026-06-15T09:00:00+09:00" } }],
    });
    const b = makeFakeCalendar({
      email: "b@example.com",
      list: [{ id: "eb", summary: "B会議", start: { dateTime: "2026-06-15T08:00:00+09:00" } }],
    });
    const ctx = { accounts: [a.ctx.accounts[0], b.ctx.accounts[0]] };

    const result = (await executeTool(ctx, "list_events", {
      timeMin: "2026-06-15T00:00:00+09:00",
      timeMax: "2026-06-16T00:00:00+09:00",
    })) as { id: string; accountEmail?: string }[];

    expect(result.length).toBe(2);
    // 開始時刻でソート（B 08:00 が先）
    expect(result[0].id).toBe("eb");
    expect(result[0].accountEmail).toBe("b@example.com");
    expect(result[1].accountEmail).toBe("a@example.com");
  });

  it("全アカウントが取得失敗かつ0件ならエラーを投げる（空と区別）", async () => {
    const a = makeFakeCalendar({ email: "a@example.com" });
    (a.list as unknown as { mockRejectedValueOnce: (e: Error) => void }).mockRejectedValueOnce(
      new Error("insufficient authentication scopes"),
    );
    const ctx = { accounts: [a.ctx.accounts[0]] };
    await expect(
      executeTool(ctx, "list_events", {
        timeMin: "2026-06-15T00:00:00+09:00",
        timeMax: "2026-06-16T00:00:00+09:00",
      }),
    ).rejects.toThrow(/取得できませんでした/);
  });

  it("一部失敗時は events と unreadableAccounts を返す", async () => {
    const ok = makeFakeCalendar({
      email: "ok@example.com",
      list: [{ id: "e1", summary: "会議", start: { dateTime: "2026-06-15T10:00:00+09:00" } }],
    });
    const ng = makeFakeCalendar({ email: "ng@example.com" });
    (ng.list as unknown as { mockRejectedValueOnce: (e: Error) => void }).mockRejectedValueOnce(
      new Error("scopes"),
    );
    const ctx = { accounts: [ok.ctx.accounts[0], ng.ctx.accounts[0]] };
    const result = (await executeTool(ctx, "list_events", {
      timeMin: "2026-06-15T00:00:00+09:00",
      timeMax: "2026-06-16T00:00:00+09:00",
    })) as { events: unknown[]; unreadableAccounts: { email: string }[] };
    expect(result.events).toHaveLength(1);
    expect(result.unreadableAccounts[0].email).toBe("ng@example.com");
  });

  it("account 指定で対象アカウントの calendar のみ使う", async () => {
    const a = makeFakeCalendar({ email: "a@example.com" });
    const b = makeFakeCalendar({ email: "b@example.com" });
    const ctx = { accounts: [a.ctx.accounts[0], b.ctx.accounts[0]] };

    await executeTool(ctx, "create_event", {
      summary: "テスト",
      start: "2026-06-15T10:00:00+09:00",
      end: "2026-06-15T11:00:00+09:00",
      account: "b@example.com",
    });
    expect(b.insert).toHaveBeenCalledOnce();
    expect(a.insert).not.toHaveBeenCalled();
  });
});
