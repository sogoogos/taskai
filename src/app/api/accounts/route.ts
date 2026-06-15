import { NextResponse } from "next/server";
import { getSession, accountIdsOf } from "@/lib/session";
import { getUserById } from "@/lib/db";

export const runtime = "nodejs";

/** 連携中の Google アカウント一覧を返す */
export async function GET() {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "未ログインです" }, { status: 401 });
  }
  const ids = accountIdsOf(session);
  const accounts = ids
    .map((id) => {
      const u = getUserById(id);
      return u ? { id: u.id, email: u.email, isPrimary: u.id === session.userId } : null;
    })
    .filter(Boolean);
  return NextResponse.json({ accounts });
}
