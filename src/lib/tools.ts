import type Anthropic from "@anthropic-ai/sdk";
import {
  listEvents,
  aggregateEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  DEFAULT_TIMEZONE,
  type CalendarContext,
  type CalendarAccount,
} from "./calendar";
import { searchPlaces } from "./places";

/** account パラメータ共通の説明 */
const ACCOUNT_DESC =
  "対象 Google アカウントのメールアドレス。省略時は既定アカウント。";

/** Claude に渡すツール定義。description は「いつ呼ぶか」を明記する。 */
export const calendarTools: Anthropic.Tool[] = [
  {
    name: "list_events",
    description:
      "指定期間のカレンダー予定を取得する。ユーザーが『今日/今週/来週の予定』『〇〇の予定はある?』などスケジュールの確認や、更新・削除のために対象を探すときに呼ぶ。account を省略すると連携中の全アカウントを集約して返す（各予定に accountEmail が付く）。",
    input_schema: {
      type: "object",
      properties: {
        timeMin: { type: "string", description: "取得開始 ISO8601（例 2026-06-15T00:00:00+09:00）" },
        timeMax: { type: "string", description: "取得終了 ISO8601" },
        query: { type: "string", description: "タイトル等のキーワード絞り込み（任意）" },
        account: { type: "string", description: `${ACCOUNT_DESC} 省略時は全アカウント集約。` },
      },
      required: ["timeMin", "timeMax"],
    },
  },
  {
    name: "create_event",
    description:
      "新しい予定を作成する。ユーザーが『〇〇を入れて』『〇時から会議』『毎日△△の勉強を1時間』など予定追加を依頼したときに呼ぶ。繰り返しは recurrence に RRULE を指定する（例 毎日=['RRULE:FREQ=DAILY']、平日=['RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR']）。account で作成先アカウントを指定できる。",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "予定のタイトル" },
        start: { type: "string", description: "開始 ISO8601（タイムゾーン込み推奨）" },
        end: { type: "string", description: "終了 ISO8601" },
        description: { type: "string", description: "メモ（任意）" },
        location: { type: "string", description: "場所（任意）" },
        attendees: {
          type: "array",
          items: { type: "string" },
          description: "参加者メール（任意）",
        },
        recurrence: {
          type: "array",
          items: { type: "string" },
          description: "繰り返しルール RRULE の配列（任意）",
        },
        account: { type: "string", description: ACCOUNT_DESC },
      },
      required: ["summary", "start", "end"],
    },
  },
  {
    name: "update_event",
    description:
      "既存の予定を変更する。先に list_events で対象の eventId と accountEmail を特定し、その account を必ず渡す。変更したいフィールドだけ渡す。",
    input_schema: {
      type: "object",
      properties: {
        eventId: { type: "string", description: "対象予定の ID" },
        summary: { type: "string" },
        start: { type: "string", description: "開始 ISO8601" },
        end: { type: "string", description: "終了 ISO8601" },
        description: { type: "string" },
        location: { type: "string" },
        recurrence: { type: "array", items: { type: "string" } },
        account: { type: "string", description: `${ACCOUNT_DESC} 予定が属するアカウントを指定する。` },
      },
      required: ["eventId"],
    },
  },
  {
    name: "delete_event",
    description:
      "予定を削除する。破壊的操作なので、実行前にユーザーへ対象を要約し確認を取ってから呼ぶこと。先に list_events で eventId と accountEmail を特定し、その account を渡す。",
    input_schema: {
      type: "object",
      properties: {
        eventId: { type: "string", description: "対象予定の ID" },
        account: { type: "string", description: `${ACCOUNT_DESC} 予定が属するアカウントを指定する。` },
      },
      required: ["eventId"],
    },
  },
  {
    name: "find_places",
    description:
      "カフェ・店舗・コワーキングスペースなど『場所』を探すときに使う。ユーザーが『〇〇の近くでカフェ』『この予定の場所周辺で…』などと尋ねたら呼ぶ。near に基準地点（住所・駅名・施設名・予定の場所など）、query に探す種類を渡す。営業中のみは openNow=true。結果は名前/住所/評価/営業中かを返すが、Wi-Fi・電源・混雑状況は含まれない点に留意して助言する。",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "探す対象（例: カフェ、コワーキングスペース）" },
        near: { type: "string", description: "基準地点（住所・駅・施設名など）" },
        openNow: { type: "boolean", description: "営業中のみに絞る（任意）" },
      },
      required: ["query"],
    },
  },
];

/** account メールから対象アカウントを解決（無ければ既定 = accounts[0]） */
function resolveAccount(ctx: CalendarContext, email?: string): CalendarAccount {
  if (email) {
    const found = ctx.accounts.find(
      (a) => a.email.toLowerCase() === email.toLowerCase(),
    );
    if (found) return found;
  }
  return ctx.accounts[0];
}

/** ツール実行結果（JSON 文字列化して tool_result に入れる） */
export async function executeTool(
  ctx: CalendarContext,
  name: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  // どのツールがどの引数で呼ばれたかをサーバログに出す（診断用）
  console.log(`[tool] ${name} ${JSON.stringify(input)}`);

  // 場所検索はカレンダー連携に依存しない
  if (name === "find_places") {
    return searchPlaces({
      query: String(input.query),
      near: input.near ? String(input.near) : undefined,
      openNow: typeof input.openNow === "boolean" ? input.openNow : undefined,
    });
  }

  if (ctx.accounts.length === 0) {
    throw new Error("連携中の Google アカウントがありません");
  }
  const account = input.account ? String(input.account) : undefined;

  switch (name) {
    case "list_events": {
      const params = {
        timeMin: String(input.timeMin),
        timeMax: String(input.timeMax),
        query: input.query ? String(input.query) : undefined,
      };
      if (account) {
        const acc = resolveAccount(ctx, account);
        const events = await listEvents(acc.calendar, params);
        return events.map((e) => ({ ...e, accountEmail: acc.email }));
      }
      // account 省略 → 全アカウント集約
      const { events, errors } = await aggregateEvents(ctx.accounts, params);
      console.log(
        `[tool] list_events → ${events.length}件 / 失敗 ${errors.length}アカウント`,
      );
      // 全アカウントが失敗かつ0件なら「空」ではなく「エラー」として返す
      if (events.length === 0 && errors.length > 0) {
        throw new Error(
          `予定を取得できませんでした（権限不足の可能性）: ${errors
            .map((e) => `${e.email}: ${e.message}`)
            .join("; ")}`,
        );
      }
      // 一部失敗があれば events と併せて警告も返す
      if (errors.length > 0) {
        return { events, unreadableAccounts: errors };
      }
      return events;
    }
    case "create_event": {
      const acc = resolveAccount(ctx, account);
      const created = await createEvent(acc.calendar, {
        summary: String(input.summary),
        start: String(input.start),
        end: String(input.end),
        description: input.description ? String(input.description) : undefined,
        location: input.location ? String(input.location) : undefined,
        attendees: Array.isArray(input.attendees)
          ? (input.attendees as string[])
          : undefined,
        recurrence: Array.isArray(input.recurrence)
          ? (input.recurrence as string[])
          : undefined,
        timeZone: DEFAULT_TIMEZONE,
      });
      return { ...created, accountEmail: acc.email };
    }
    case "update_event": {
      const acc = resolveAccount(ctx, account);
      const updated = await updateEvent(acc.calendar, {
        eventId: String(input.eventId),
        summary: input.summary !== undefined ? String(input.summary) : undefined,
        start: input.start !== undefined ? String(input.start) : undefined,
        end: input.end !== undefined ? String(input.end) : undefined,
        description:
          input.description !== undefined ? String(input.description) : undefined,
        location: input.location !== undefined ? String(input.location) : undefined,
        recurrence: Array.isArray(input.recurrence)
          ? (input.recurrence as string[])
          : undefined,
        timeZone: DEFAULT_TIMEZONE,
      });
      return { ...updated, accountEmail: acc.email };
    }
    case "delete_event": {
      const acc = resolveAccount(ctx, account);
      const res = await deleteEvent(acc.calendar, String(input.eventId));
      return { ...res, accountEmail: acc.email };
    }
    default:
      throw new Error(`未知のツール: ${name}`);
  }
}
