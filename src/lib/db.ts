import { createClient, type Client, type Row } from "@libsql/client";
import fs from "node:fs";
import path from "node:path";

/**
 * libSQL クライアント。
 * - ローカル: TURSO_DATABASE_URL 未設定なら file:./data/taskai.sqlite（既存SQLite互換）
 * - 本番(Vercel等): TURSO_DATABASE_URL + TURSO_AUTH_TOKEN を設定（Turso）
 */
const globalForDb = globalThis as unknown as {
  __taskaiDb?: Client;
  __schemaReady?: Promise<void>;
};

function getClient(): Client {
  if (!globalForDb.__taskaiDb) {
    const url = process.env.TURSO_DATABASE_URL ?? "file:./data/taskai.sqlite";
    if (url.startsWith("file:")) {
      // ローカルファイルは親ディレクトリを用意
      const filePath = url.slice("file:".length);
      fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
      globalForDb.__taskaiDb = createClient({ url });
    } else {
      globalForDb.__taskaiDb = createClient({
        url,
        authToken: process.env.TURSO_AUTH_TOKEN,
      });
    }
  }
  return globalForDb.__taskaiDb;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT UNIQUE NOT NULL,
    access_token  TEXT,
    refresh_token TEXT,
    expiry_date   INTEGER,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS conversations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL,
    content         TEXT NOT NULL,
    created_at      INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS profiles (
    user_id      INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    home_address TEXT,
    note         TEXT,
    updated_at   INTEGER NOT NULL
  );
`;

/** スキーマ適用（プロセス内で一度だけ実行、以降は同じPromiseを待つ） */
function ensureSchema(): Promise<void> {
  if (!globalForDb.__schemaReady) {
    globalForDb.__schemaReady = getClient()
      .executeMultiple(SCHEMA)
      .then(() => undefined);
  }
  return globalForDb.__schemaReady;
}

async function db(): Promise<Client> {
  await ensureSchema();
  return getClient();
}

// libSQL の値を扱いやすい型へ
function asString(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v);
}
function asNumber(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v);
}

export interface UserRow {
  id: number;
  email: string;
  access_token: string | null;
  refresh_token: string | null;
  expiry_date: number | null;
  created_at: number;
  updated_at: number;
}

function rowToUser(r: Row): UserRow {
  return {
    id: Number(r.id),
    email: String(r.email),
    access_token: asString(r.access_token),
    refresh_token: asString(r.refresh_token),
    expiry_date: asNumber(r.expiry_date),
    created_at: Number(r.created_at),
    updated_at: Number(r.updated_at),
  };
}

/** Google から得たトークンとメールで users を upsert し、ユーザーIDを返す */
export async function upsertUser(params: {
  email: string;
  accessToken: string | null;
  refreshToken: string | null;
  expiryDate: number | null;
}): Promise<number> {
  const c = await db();
  const now = Date.now();
  const existing = await c.execute({
    sql: "SELECT id FROM users WHERE email = ?",
    args: [params.email],
  });

  if (existing.rows.length > 0) {
    const id = Number(existing.rows[0].id);
    await c.execute({
      sql: `UPDATE users
              SET access_token = ?,
                  refresh_token = COALESCE(?, refresh_token),
                  expiry_date = ?,
                  updated_at = ?
            WHERE id = ?`,
      args: [params.accessToken, params.refreshToken, params.expiryDate, now, id],
    });
    return id;
  }

  const ins = await c.execute({
    sql: `INSERT INTO users (email, access_token, refresh_token, expiry_date, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [
      params.email,
      params.accessToken,
      params.refreshToken,
      params.expiryDate,
      now,
      now,
    ],
  });
  return Number(ins.lastInsertRowid);
}

export async function getUserById(id: number): Promise<UserRow | undefined> {
  const c = await db();
  const rs = await c.execute({ sql: "SELECT * FROM users WHERE id = ?", args: [id] });
  return rs.rows[0] ? rowToUser(rs.rows[0]) : undefined;
}

/** トークンが更新されたとき DB に書き戻す */
export async function updateUserTokens(
  id: number,
  tokens: { accessToken?: string | null; refreshToken?: string | null; expiryDate?: number | null },
): Promise<void> {
  const c = await db();
  await c.execute({
    sql: `UPDATE users
            SET access_token = COALESCE(?, access_token),
                refresh_token = COALESCE(?, refresh_token),
                expiry_date = COALESCE(?, expiry_date),
                updated_at = ?
          WHERE id = ?`,
    args: [
      tokens.accessToken ?? null,
      tokens.refreshToken ?? null,
      tokens.expiryDate ?? null,
      Date.now(),
      id,
    ],
  });
}

export interface Profile {
  homeAddress: string | null;
  note: string | null;
}

export async function getProfile(userId: number): Promise<Profile> {
  const c = await db();
  const rs = await c.execute({
    sql: "SELECT home_address, note FROM profiles WHERE user_id = ?",
    args: [userId],
  });
  const r = rs.rows[0];
  return {
    homeAddress: r ? asString(r.home_address) : null,
    note: r ? asString(r.note) : null,
  };
}

export async function setProfile(userId: number, profile: Profile): Promise<void> {
  const c = await db();
  await c.execute({
    sql: `INSERT INTO profiles (user_id, home_address, note, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET
            home_address = excluded.home_address,
            note = excluded.note,
            updated_at = excluded.updated_at`,
    args: [userId, profile.homeAddress, profile.note, Date.now()],
  });
}
