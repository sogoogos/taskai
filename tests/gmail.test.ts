import { describe, it, expect, vi } from "vitest";
import type { gmail_v1 } from "googleapis";
import { searchEmails } from "@/lib/gmail";

function b64url(s: string): string {
  return Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
}

function makeFakeGmail(messages: Array<{ id: string; subject: string; from: string; body: string }>) {
  const list = vi.fn(async (_params: { userId: string; q?: string; maxResults?: number }) => ({
    data: { messages: messages.map((m) => ({ id: m.id })) },
  }));
  const get = vi.fn(async ({ id }: { id: string }) => {
    const m = messages.find((x) => x.id === id)!;
    return {
      data: {
        snippet: m.body.slice(0, 40),
        payload: {
          headers: [
            { name: "Subject", value: m.subject },
            { name: "From", value: m.from },
            { name: "Date", value: "Mon, 15 Jun 2026 10:00:00 +0900" },
          ],
          mimeType: "text/plain",
          body: { data: b64url(m.body) },
        },
      },
    };
  });
  const gmail = {
    users: { messages: { list, get } },
  } as unknown as gmail_v1.Gmail;
  return { gmail, list, get };
}

describe("searchEmails", () => {
  it("query を渡してメールを取得し、件名・本文をデコードして返す", async () => {
    const { gmail, list } = makeFakeGmail([
      { id: "m1", subject: "面接のご案内", from: "hr@example.com", body: "6/20 14:00 に渋谷オフィスで面接です。" },
      { id: "m2", subject: "予約確認", from: "shop@example.com", body: "ご予約: 6/21 19:00 銀座店" },
    ]);

    const result = await searchEmails(gmail, { query: "newer_than:14d", maxResults: 10 });

    expect(list).toHaveBeenCalledOnce();
    expect(list.mock.calls[0][0]).toMatchObject({ userId: "me", q: "newer_than:14d", maxResults: 10 });
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: "m1", subject: "面接のご案内", from: "hr@example.com" });
    expect(result[0].body).toContain("渋谷オフィス");
    expect(result[1].body).toContain("銀座店");
  });

  it("maxResults は最大20に丸める", async () => {
    const { gmail, list } = makeFakeGmail([]);
    await searchEmails(gmail, { maxResults: 100 });
    expect(list.mock.calls[0][0].maxResults).toBe(20);
  });
});
