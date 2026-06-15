import { NextResponse, type NextRequest } from "next/server";
import { getAuthUrl } from "@/lib/google";

export async function GET(req: NextRequest) {
  try {
    const add = new URL(req.url).searchParams.get("add") === "1";
    return NextResponse.redirect(getAuthUrl(add));
  } catch (err) {
    const message = err instanceof Error ? err.message : "認証URLの生成に失敗しました";
    return new NextResponse(message, { status: 500 });
  }
}
