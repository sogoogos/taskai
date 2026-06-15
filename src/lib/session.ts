import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export interface SessionData {
  userId?: number; // 主アカウント
  email?: string; // 主アカウントのメール
  accountIds?: number[]; // 連携中の全アカウント（主を含む）
}

/** セッションから連携アカウントIDの配列を取り出す（旧Cookie互換で userId を補完） */
export function accountIdsOf(session: SessionData): number[] {
  if (session.accountIds && session.accountIds.length > 0) return session.accountIds;
  return session.userId ? [session.userId] : [];
}

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET ?? "insecure-dev-secret-change-me-please-32+chars",
  cookieName: "taskai_session",
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30, // 30日
  },
};

/** リクエストスコープのセッションを取得（Server Component / Route Handler 用） */
export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}
