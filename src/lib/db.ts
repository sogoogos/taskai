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
      // 本番(Vercel等)はファイルDBが使えない。Turso の設定漏れを明示する。
      if (process.env.VERCEL) {
        throw new Error(
          "DBが未設定です。Vercel の環境変数に TURSO_DATABASE_URL と TURSO_AUTH_TOKEN を設定してください（本番ではローカルファイルDBは使えません）。",
        );
      }
      // ローカルは親ディレクトリを用意（読み取り専用FS等では握りつぶす）
      const filePath = url.slice("file:".length);
      try {
        fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
      } catch {
        // ディレクトリ作成不可でも続行（createClient 側でエラーになればそちらで扱う）
      }
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
  CREATE TABLE IF NOT EXISTS tasks (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    notes        TEXT,
    status       TEXT NOT NULL DEFAULT 'todo',
    due_date     TEXT,
    sort_order   INTEGER NOT NULL DEFAULT 0,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL,
    completed_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
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

// --- タスク（ToDo）管理 ---

export type TaskStatus = "todo" | "doing" | "done";

export interface TaskRow {
  id: number;
  title: string;
  notes: string | null;
  status: TaskStatus;
  dueDate: string | null; // 'YYYY-MM-DD'
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
}

function normalizeStatus(v: unknown): TaskStatus {
  return v === "doing" || v === "done" ? v : "todo";
}

function rowToTask(r: Row): TaskRow {
  return {
    id: Number(r.id),
    title: String(r.title),
    notes: asString(r.notes),
    status: normalizeStatus(r.status),
    dueDate: asString(r.due_date),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
    completedAt: asNumber(r.completed_at),
  };
}

/** ユーザーのタスク一覧（未完了→完了、期日昇順、作成順）。 */
export async function listTasks(userId: number): Promise<TaskRow[]> {
  const c = await db();
  const rs = await c.execute({
    sql: `SELECT * FROM tasks
           WHERE user_id = ?
           ORDER BY CASE status WHEN 'done' THEN 1 ELSE 0 END,
                    COALESCE(due_date, '9999-99-99'),
                    sort_order, created_at`,
    args: [userId],
  });
  return rs.rows.map(rowToTask);
}

export async function getTask(userId: number, id: number): Promise<TaskRow | undefined> {
  const c = await db();
  const rs = await c.execute({
    sql: "SELECT * FROM tasks WHERE id = ? AND user_id = ?",
    args: [id, userId],
  });
  return rs.rows[0] ? rowToTask(rs.rows[0]) : undefined;
}

export async function createTask(
  userId: number,
  input: { title: string; notes?: string | null; dueDate?: string | null; status?: TaskStatus },
): Promise<TaskRow> {
  const c = await db();
  const now = Date.now();
  const status = input.status ?? "todo";
  const ins = await c.execute({
    sql: `INSERT INTO tasks (user_id, title, notes, status, due_date, sort_order, created_at, updated_at, completed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      userId,
      input.title,
      input.notes ?? null,
      status,
      input.dueDate ?? null,
      now,
      now,
      now,
      status === "done" ? now : null,
    ],
  });
  const created = await getTask(userId, Number(ins.lastInsertRowid));
  return created!;
}

/** 指定フィールドのみ更新。所有者(user_id)が一致する行のみ。 */
export async function updateTask(
  userId: number,
  id: number,
  fields: { title?: string; notes?: string | null; dueDate?: string | null; status?: TaskStatus },
): Promise<TaskRow | undefined> {
  const c = await db();
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  if (fields.title !== undefined) {
    sets.push("title = ?");
    args.push(fields.title);
  }
  if (fields.notes !== undefined) {
    sets.push("notes = ?");
    args.push(fields.notes);
  }
  if (fields.dueDate !== undefined) {
    sets.push("due_date = ?");
    args.push(fields.dueDate);
  }
  if (fields.status !== undefined) {
    sets.push("status = ?");
    args.push(fields.status);
    sets.push("completed_at = ?");
    args.push(fields.status === "done" ? Date.now() : null);
  }
  if (sets.length === 0) return getTask(userId, id);
  sets.push("updated_at = ?");
  args.push(Date.now());
  args.push(id, userId);
  await c.execute({
    sql: `UPDATE tasks SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`,
    args,
  });
  return getTask(userId, id);
}

export async function deleteTask(userId: number, id: number): Promise<boolean> {
  const c = await db();
  const rs = await c.execute({
    sql: "DELETE FROM tasks WHERE id = ? AND user_id = ?",
    args: [id, userId],
  });
  return rs.rowsAffected > 0;
}
