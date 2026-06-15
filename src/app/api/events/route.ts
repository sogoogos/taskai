import { NextResponse, type NextRequest } from "next/server";
import { getSession, accountIdsOf } from "@/lib/session";
import { calendarAccountsForIds } from "@/lib/google";
import { aggregateEvents } from "@/lib/calendar";

export const runtime = "nodejs";

/**
 * 連携中の全アカウントの予定を集約して返す。
 * クエリ from/to（ISO8601）で期間指定可。未指定なら今日から2週間（アジェンダ用）。
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "未ログインです" }, { status: 401 });
  }

  try {
    const accounts = await calendarAccountsForIds(accountIdsOf(session));
    if (accounts.length === 0) {
      return NextResponse.json({ events: [] });
    }
    const params = new URL(req.url).searchParams;
    const now = new Date();
    const twoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const timeMin = params.get("from") ?? now.toISOString();
    const timeMax = params.get("to") ?? twoWeeks.toISOString();
    const { events, errors } = await aggregateEvents(accounts, {
      timeMin,
      timeMax,
      maxResults: 100,
    });
    return NextResponse.json({ events, warnings: errors });
  } catch (err) {
    const message = err instanceof Error ? err.message : "予定の取得に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
