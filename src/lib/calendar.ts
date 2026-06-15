import type { calendar_v3, gmail_v1 } from "googleapis";

export const DEFAULT_TIMEZONE = "Asia/Tokyo";

/** 1つの Google アカウントと各種クライアント。accounts[0] を既定とする。 */
export interface CalendarAccount {
  email: string;
  calendar: calendar_v3.Calendar;
  gmail?: gmail_v1.Gmail; // Gmail 連携時のみ
}

/** 複数アカウント横断のコンテキスト（accounts[0] = 既定アカウント） */
export interface CalendarContext {
  accounts: CalendarAccount[];
  userId?: number; // タスク(ToDo)ツール用。DBのユーザーID
}

/** チャットや UI に返す正規化済みの予定表現 */
export interface NormalizedEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start?: string; // ISO 文字列 or 終日の日付
  end?: string;
  allDay: boolean;
  recurrence?: string[]; // RRULE など
  attendees?: string[];
  htmlLink?: string;
  accountEmail?: string; // どのアカウントの予定か
}

/** Google の Event を正規化 */
export function normalizeEvent(e: calendar_v3.Schema$Event): NormalizedEvent {
  const allDay = Boolean(e.start?.date && !e.start?.dateTime);
  return {
    id: e.id ?? "",
    summary: e.summary ?? "(無題)",
    description: e.description ?? undefined,
    location: e.location ?? undefined,
    start: e.start?.dateTime ?? e.start?.date ?? undefined,
    end: e.end?.dateTime ?? e.end?.date ?? undefined,
    allDay,
    recurrence: e.recurrence ?? undefined,
    attendees: e.attendees?.map((a) => a.email ?? "").filter(Boolean),
    htmlLink: e.htmlLink ?? undefined,
  };
}

export interface CreateEventInput {
  summary: string;
  start: string; // ISO 8601（例 2026-06-15T15:00:00+09:00）
  end: string;
  description?: string;
  location?: string;
  attendees?: string[];
  recurrence?: string[]; // 例 ["RRULE:FREQ=DAILY"]
  timeZone?: string;
}

/** CreateEventInput を Google の requestBody に変換（純粋関数・テスト対象） */
export function buildEventBody(input: CreateEventInput): calendar_v3.Schema$Event {
  const tz = input.timeZone ?? DEFAULT_TIMEZONE;
  return {
    summary: input.summary,
    description: input.description,
    location: input.location,
    start: { dateTime: input.start, timeZone: tz },
    end: { dateTime: input.end, timeZone: tz },
    attendees: input.attendees?.map((email) => ({ email })),
    recurrence: input.recurrence,
  };
}

export interface UpdateEventInput {
  eventId: string;
  summary?: string;
  start?: string;
  end?: string;
  description?: string;
  location?: string;
  recurrence?: string[];
  timeZone?: string;
}

/** 部分更新用の requestBody を組み立てる（指定フィールドのみ・テスト対象） */
export function buildPatchBody(input: UpdateEventInput): calendar_v3.Schema$Event {
  const tz = input.timeZone ?? DEFAULT_TIMEZONE;
  const body: calendar_v3.Schema$Event = {};
  if (input.summary !== undefined) body.summary = input.summary;
  if (input.description !== undefined) body.description = input.description;
  if (input.location !== undefined) body.location = input.location;
  if (input.start !== undefined) body.start = { dateTime: input.start, timeZone: tz };
  if (input.end !== undefined) body.end = { dateTime: input.end, timeZone: tz };
  if (input.recurrence !== undefined) body.recurrence = input.recurrence;
  return body;
}

// --- Google API を呼ぶ薄いラッパ（calendar クライアントを引数で受けてモック可能に） ---

export async function listEvents(
  calendar: calendar_v3.Calendar,
  params: { timeMin: string; timeMax: string; query?: string; maxResults?: number },
): Promise<NormalizedEvent[]> {
  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin: params.timeMin,
    timeMax: params.timeMax,
    q: params.query,
    singleEvents: true,
    orderBy: "startTime",
    maxResults: params.maxResults ?? 50,
  });
  return (res.data.items ?? []).map(normalizeEvent);
}

export interface AccountError {
  email: string;
  message: string;
}

/**
 * 複数アカウントの予定を集約。アカウント単位でエラーを捕捉し、
 * 失敗したアカウントはスキップして成功分のみ返す（権限不足/期限切れで全体が落ちないように）。
 */
export async function aggregateEvents(
  accounts: CalendarAccount[],
  params: { timeMin: string; timeMax: string; query?: string; maxResults?: number },
): Promise<{ events: NormalizedEvent[]; errors: AccountError[] }> {
  const collected: NormalizedEvent[] = [];
  const errors: AccountError[] = [];
  await Promise.all(
    accounts.map(async (a) => {
      try {
        const events = await listEvents(a.calendar, params);
        for (const e of events) collected.push({ ...e, accountEmail: a.email });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[calendar] ${a.email} 取得失敗: ${message}`);
        errors.push({ email: a.email, message });
      }
    }),
  );
  collected.sort((x, y) => (x.start ?? "").localeCompare(y.start ?? ""));
  return { events: collected, errors };
}

/** 複数アカウントの予定を集約（成功分の予定のみ。エラーは無視）。チャットのツール用。 */
export async function listEventsForAccounts(
  accounts: CalendarAccount[],
  params: { timeMin: string; timeMax: string; query?: string; maxResults?: number },
): Promise<NormalizedEvent[]> {
  return (await aggregateEvents(accounts, params)).events;
}

export async function createEvent(
  calendar: calendar_v3.Calendar,
  input: CreateEventInput,
): Promise<NormalizedEvent> {
  const res = await calendar.events.insert({
    calendarId: "primary",
    requestBody: buildEventBody(input),
  });
  return normalizeEvent(res.data);
}

export async function updateEvent(
  calendar: calendar_v3.Calendar,
  input: UpdateEventInput,
): Promise<NormalizedEvent> {
  const res = await calendar.events.patch({
    calendarId: "primary",
    eventId: input.eventId,
    requestBody: buildPatchBody(input),
  });
  return normalizeEvent(res.data);
}

export async function deleteEvent(
  calendar: calendar_v3.Calendar,
  eventId: string,
): Promise<{ deleted: true; eventId: string }> {
  await calendar.events.delete({ calendarId: "primary", eventId });
  return { deleted: true, eventId };
}
