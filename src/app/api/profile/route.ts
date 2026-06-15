import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { getProfile, setProfile } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "未ログインです" }, { status: 401 });
  }
  return NextResponse.json({ profile: await getProfile(session.userId) });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "未ログインです" }, { status: 401 });
  }
  let body: { homeAddress?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }
  const homeAddress = (body.homeAddress ?? "").trim() || null;
  const note = (body.note ?? "").trim() || null;
  try {
    await setProfile(session.userId, { homeAddress, note });
  } catch (err) {
    const message = err instanceof Error ? err.message : "保存に失敗しました";
    console.error("[profile] save failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
  return NextResponse.json({ profile: { homeAddress, note } });
}
