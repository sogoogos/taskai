import { NextResponse, type NextRequest } from "next/server";
import { upsertTradingStatus } from "@/lib/db";
import { normalizeTradingPayload } from "@/lib/trading";

export const runtime = "nodejs";

/**
 * 外部(kabu-trader/EC2)からスイング取引状況を受け取る受け口。
 * Authorization: Bearer <TRADING_INGEST_TOKEN> で認証する。
 * body: { source, label?, currency?, payload }
 */
export async function POST(req: NextRequest) {
  const token = process.env.TRADING_INGEST_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "TRADING_INGEST_TOKEN が未設定です" },
      { status: 503 },
    );
  }
  const auth = req.headers.get("authorization") ?? "";
  const provided = auth.replace(/^Bearer\s+/i, "");
  if (provided !== token) {
    return NextResponse.json({ error: "認証に失敗しました" }, { status: 401 });
  }

  let body: { source?: string; label?: string; currency?: string; payload?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }
  const source = body.source?.trim();
  if (!source) {
    return NextResponse.json({ error: "source が必要です" }, { status: 400 });
  }

  // 正規化して保存（壊れた送信でも summary は 0 埋めされる）
  const payload = normalizeTradingPayload(body.payload);
  await upsertTradingStatus({
    source,
    label: body.label ?? null,
    currency: body.currency ?? null,
    payload,
  });
  return NextResponse.json({ ok: true, source });
}
