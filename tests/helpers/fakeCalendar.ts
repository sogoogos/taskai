import { vi } from "vitest";
import type { calendar_v3 } from "googleapis";
import type { CalendarContext } from "@/lib/calendar";

/** googleapis の calendar_v3.Calendar を模した最小のフェイク。
 *  events.list/insert/patch/delete を vi.fn で差し替える。
 *  単一アカウントの CalendarContext (ctx) も返す。 */
export function makeFakeCalendar(overrides?: {
  list?: unknown;
  insert?: unknown;
  patch?: unknown;
  delete?: unknown;
  email?: string;
}) {
  const list = vi.fn().mockResolvedValue({
    data: { items: overrides?.list ?? [] },
  });
  const insert = vi.fn().mockResolvedValue({
    data: overrides?.insert ?? { id: "new-1", summary: "created" },
  });
  const patch = vi.fn().mockResolvedValue({
    data: overrides?.patch ?? { id: "e1", summary: "patched" },
  });
  const del = vi.fn().mockResolvedValue({ data: overrides?.delete ?? {} });

  const calendar = {
    events: { list, insert, patch, delete: del },
  } as unknown as calendar_v3.Calendar;

  const email = overrides?.email ?? "me@example.com";
  const ctx: CalendarContext = { accounts: [{ email, calendar }] };

  return { calendar, ctx, list, insert, patch, del, email };
}
