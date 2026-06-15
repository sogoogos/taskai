import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

// SQLite ファイルの場所。デフォルトは ./data/taskai.sqlite
const dbPath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(process.cwd(), "data", "taskai.sqlite");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

// Next.js の dev/build ではモジュールが複数回・複数ワーカーで評価されるため、
// 接続はモジュール読み込み時ではなく初回利用時に遅延生成して使い回す
const globalForDb = globalThis as unknown as { __taskaiDb?: Database.Database };

/** スキーマ適用（CREATE TABLE IF NOT EXISTS は冪等）。新テーブル追加にも追従できるよう毎接続で実行。 */
function ensureSchema(db: Database.Database): void {
  db.exec(`
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
  `);
}

function init(): Database.Database {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000"); // ロック競合時に待機
  return db;
}

// 接続ごとに一度だけスキーマ適用する（dev の HMR で接続が使い回されても新テーブルを作る）
const schemaApplied = new WeakSet<Database.Database>();

/** SQLite 接続を遅延取得（初回呼び出し時にオープン）。モジュール評価時には開かない。 */
function getDb(): Database.Database {
  if (!globalForDb.__taskaiDb) {
    globalForDb.__taskaiDb = init();
  }
  const db = globalForDb.__taskaiDb;
  if (!schemaApplied.has(db)) {
    ensureSchema(db);
    schemaApplied.add(db);
  }
  return db;
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

/** Google から得たトークンとメールで users を upsert し、ユーザーIDを返す */
export function upsertUser(params: {
  email: string;
  accessToken: string | null;
  refreshToken: string | null;
  expiryDate: number | null;
}): number {
  const db = getDb();
  const now = Date.now();
  const existing = db
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(params.email) as UserRow | undefined;

  if (existing) {
    db.prepare(
      `UPDATE users
         SET access_token = ?,
             -- refresh_token は再同意時のみ返るため、無い場合は既存値を保持
             refresh_token = COALESCE(?, refresh_token),
             expiry_date = ?,
             updated_at = ?
       WHERE id = ?`,
    ).run(
      params.accessToken,
      params.refreshToken,
      params.expiryDate,
      now,
      existing.id,
    );
    return existing.id;
  }

  const info = db
    .prepare(
      `INSERT INTO users (email, access_token, refresh_token, expiry_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      params.email,
      params.accessToken,
      params.refreshToken,
      params.expiryDate,
      now,
      now,
    );
  return Number(info.lastInsertRowid);
}

export function getUserById(id: number): UserRow | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as
    | UserRow
    | undefined;
}

export interface Profile {
  homeAddress: string | null;
  note: string | null;
}

/** ユーザーのプロフィールを取得（無ければ空） */
export function getProfile(userId: number): Profile {
  const db = getDb();
  const row = db
    .prepare("SELECT home_address, note FROM profiles WHERE user_id = ?")
    .get(userId) as { home_address: string | null; note: string | null } | undefined;
  return {
    homeAddress: row?.home_address ?? null,
    note: row?.note ?? null,
  };
}

/** ユーザーのプロフィールを保存（upsert） */
export function setProfile(userId: number, profile: Profile): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO profiles (user_id, home_address, note, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       home_address = excluded.home_address,
       note = excluded.note,
       updated_at = excluded.updated_at`,
  ).run(userId, profile.homeAddress, profile.note, Date.now());
}

/** トークンが更新されたとき DB に書き戻す */
export function updateUserTokens(
  id: number,
  tokens: { accessToken?: string | null; refreshToken?: string | null; expiryDate?: number | null },
): void {
  const db = getDb();
  db.prepare(
    `UPDATE users
       SET access_token = COALESCE(?, access_token),
           refresh_token = COALESCE(?, refresh_token),
           expiry_date = COALESCE(?, expiry_date),
           updated_at = ?
     WHERE id = ?`,
  ).run(
    tokens.accessToken ?? null,
    tokens.refreshToken ?? null,
    tokens.expiryDate ?? null,
    Date.now(),
    id,
  );
}
