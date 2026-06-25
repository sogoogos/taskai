import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 現在デプロイ中のバージョン（コミットSHA）を返す。
 *  クライアントに焼き込んだ NEXT_PUBLIC_BUILD_ID と照合し、
 *  食い違えば「新しい版がある」と判断する（更新バナー用）。 */
export function GET() {
  const version = process.env.VERCEL_GIT_COMMIT_SHA || "dev";
  return NextResponse.json(
    { version },
    { headers: { "Cache-Control": "no-store, must-revalidate" } },
  );
}
