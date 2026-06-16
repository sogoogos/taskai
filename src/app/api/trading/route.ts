import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { listTradingStatus } from "@/lib/db";

export const runtime = "nodejs";

/** ログインユーザー向け: 全市場の最新スイング取引状況を返す */
export async function GET() {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "未ログインです" }, { status: 401 });
  }
  const statuses = await listTradingStatus();
  return NextResponse.json({ statuses });
}
