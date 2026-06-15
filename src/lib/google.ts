import { google } from "googleapis";
import type { calendar_v3 } from "googleapis";
import { getUserById, updateUserTokens, type UserRow } from "./db";
import type { CalendarAccount } from "./calendar";

// googleapis が公開する OAuth2 クライアント型（型 identity を googleapis 側に揃える）
type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

export const GOOGLE_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/calendar",
];

export function createOAuthClient(): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI が未設定です（.env.local を確認）",
    );
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/** 同意画面の URL を生成。add=true なら別アカウント追加用（アカウント選択を表示）。 */
export function getAuthUrl(add = false): string {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline", // refresh_token を得る
    // consent で refresh_token を確実に取得。追加時は select_account で別アカウントを選べる
    prompt: add ? "consent select_account" : "consent",
    scope: GOOGLE_SCOPES,
    state: add ? "add" : "login",
  });
}

/** callback で受けた code をトークン交換し、ユーザーのメールも取得 */
export async function exchangeCodeForTokens(code: string): Promise<{
  email: string;
  accessToken: string | null;
  refreshToken: string | null;
  expiryDate: number | null;
}> {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const { data } = await oauth2.userinfo.get();
  if (!data.email) {
    throw new Error("Google からメールアドレスを取得できませんでした");
  }

  return {
    email: data.email,
    accessToken: tokens.access_token ?? null,
    refreshToken: tokens.refresh_token ?? null,
    expiryDate: tokens.expiry_date ?? null,
  };
}

/**
 * 保存済みトークンから OAuth クライアントを復元する。
 * トークン更新時は DB に書き戻す（refresh の自動化）。
 */
export function oauthClientForUser(user: UserRow): OAuth2Client {
  const client = createOAuthClient();
  client.setCredentials({
    access_token: user.access_token ?? undefined,
    refresh_token: user.refresh_token ?? undefined,
    expiry_date: user.expiry_date ?? undefined,
  });

  // googleapis がトークンを自動更新したら DB に保存
  client.on("tokens", (tokens) => {
    updateUserTokens(user.id, {
      accessToken: tokens.access_token ?? null,
      refreshToken: tokens.refresh_token ?? null,
      expiryDate: tokens.expiry_date ?? null,
    });
  });

  return client;
}

/** ユーザーID から Calendar クライアントを得る */
export function calendarForUserId(userId: number): calendar_v3.Calendar {
  const user = getUserById(userId);
  if (!user) throw new Error("ユーザーが見つかりません");
  if (!user.refresh_token && !user.access_token) {
    throw new Error("Google 連携が未完了です。再ログインしてください");
  }
  const auth = oauthClientForUser(user);
  return google.calendar({ version: "v3", auth });
}

/** 複数アカウントID から CalendarAccount[] を生成（トークンが無いものはスキップ） */
export function calendarAccountsForIds(ids: number[]): CalendarAccount[] {
  const accounts: CalendarAccount[] = [];
  for (const id of ids) {
    const user = getUserById(id);
    if (!user || (!user.refresh_token && !user.access_token)) continue;
    const auth = oauthClientForUser(user);
    accounts.push({
      email: user.email,
      calendar: google.calendar({ version: "v3", auth }),
    });
  }
  return accounts;
}
