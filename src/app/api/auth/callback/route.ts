import { NextResponse, type NextRequest } from "next/server";
import { exchangeCodeForTokens } from "@/lib/google";
import { upsertUser } from "@/lib/db";
import { getSession, accountIdsOf } from "@/lib/session";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const state = url.searchParams.get("state");

  if (error) {
    return NextResponse.redirect(new URL(`/?auth_error=${encodeURIComponent(error)}`, req.url));
  }
  if (!code) {
    return NextResponse.redirect(new URL("/?auth_error=missing_code", req.url));
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const userId = upsertUser(tokens);
    const session = await getSession();

    if (state === "add" && session.userId) {
      // 既存セッションに別アカウントを追加（主アカウントは変更しない）
      const ids = accountIdsOf(session);
      if (!ids.includes(userId)) ids.push(userId);
      session.accountIds = ids;
    } else {
      // 新規ログイン（主アカウントを設定）
      session.userId = userId;
      session.email = tokens.email;
      session.accountIds = [userId];
    }
    await session.save();

    return NextResponse.redirect(new URL("/", req.url));
  } catch (err) {
    const message = err instanceof Error ? err.message : "認証に失敗しました";
    return NextResponse.redirect(
      new URL(`/?auth_error=${encodeURIComponent(message)}`, req.url),
    );
  }
}
