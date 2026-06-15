import { NextResponse, type NextRequest } from "next/server";
import { getSession, accountIdsOf } from "@/lib/session";
import { calendarAccountsForIds } from "@/lib/google";
import {
  updateEvent,
  deleteEvent,
  type CalendarAccount,
} from "@/lib/calendar";

export const runtime = "nodejs";

/** accountEmail から対象アカウントを解決（省略時は既定 = accounts[0]） */
async function resolveAccount(
  session: { userId?: number; accountIds?: number[] },
  accountEmail?: string,
): Promise<CalendarAccount | undefined> {
  const accounts = await calendarAccountsForIds(accountIdsOf(session));
  if (accountEmail) {
    const found = accounts.find(
      (a) => a.email.toLowerCase() === accountEmail.toLowerCase(),
    );
    if (found) return found;
  }
  return accounts[0];
}

/** 予定の更新 */
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "未ログインです" }, { status: 401 });
  }
  let body: {
    eventId?: string;
    account?: string;
    summary?: string;
    start?: string;
    end?: string;
    location?: string;
    description?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }
  if (!body.eventId) {
    return NextResponse.json({ error: "eventId が必要です" }, { status: 400 });
  }
  try {
    const acc = await resolveAccount(session, body.account);
    if (!acc) {
      return NextResponse.json({ error: "アカウントが見つかりません" }, { status: 400 });
    }
    const updated = await updateEvent(acc.calendar, {
      eventId: body.eventId,
      summary: body.summary,
      start: body.start,
      end: body.end,
      location: body.location,
      description: body.description,
    });
    return NextResponse.json({ event: { ...updated, accountEmail: acc.email } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "更新に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** 予定の削除 */
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "未ログインです" }, { status: 401 });
  }
  let body: { eventId?: string; account?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }
  if (!body.eventId) {
    return NextResponse.json({ error: "eventId が必要です" }, { status: 400 });
  }
  try {
    const acc = await resolveAccount(session, body.account);
    if (!acc) {
      return NextResponse.json({ error: "アカウントが見つかりません" }, { status: 400 });
    }
    await deleteEvent(acc.calendar, body.eventId);
    return NextResponse.json({ deleted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "削除に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
