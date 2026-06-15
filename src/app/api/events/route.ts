import { NextResponse } from "next/server";
import { getSession, accountIdsOf } from "@/lib/session";
import { calendarAccountsForIds } from "@/lib/google";
import { aggregateEvents } from "@/lib/calendar";

export const runtime = "nodejs";

/** アジェンダ用に、連携中の全アカウントの今日から2週間分の予定を集約して返す */
export async function GET() {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "未ログインです" }, { status: 401 });
  }

  try {
    const accounts = calendarAccountsForIds(accountIdsOf(session));
    if (accounts.length === 0) {
      return NextResponse.json({ events: [] });
    }
    const now = new Date();
    const twoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const { events, errors } = await aggregateEvents(accounts, {
      timeMin: now.toISOString(),
      timeMax: twoWeeks.toISOString(),
      maxResults: 50,
    });
    return NextResponse.json({ events, warnings: errors });
  } catch (err) {
    const message = err instanceof Error ? err.message : "予定の取得に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
