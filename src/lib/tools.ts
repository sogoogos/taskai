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
import { computeTravel, type TravelMode } from "./travel";
import { searchEmails } from "./gmail";
import {
  listTasks,
  createTask,
  updateTask,
  deleteTask,
  type TaskStatus,
} from "./db";

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
  {
    name: "search_emails",
    description:
      "Gmail を検索してメールを読む。『メールから予定を拾って』『〇〇からの予約メール確認して』など、メール内容を元に予定を起こしたいときに呼ぶ。query は Gmail の検索式（例 'newer_than:7d 予約', 'from:airline 搭乗', '面接 OR 会議'）。読み取ったメールから日時・場所が分かる予定候補を抽出し、ユーザーに要約提示して確認の上 create_event で追加する。account で対象アカウントを指定できる（省略時は既定）。",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Gmail 検索式（省略時は最近のメール）" },
        maxResults: { type: "number", description: "取得件数（既定10・最大20）" },
        account: { type: "string", description: ACCOUNT_DESC },
      },
      required: [],
    },
  },
  {
    name: "travel_time",
    description:
      "2地点間の移動時間を調べる。『〇〇までどれくらい?』『家から間に合う?』などで呼ぶ。origin（出発地）と destination（目的地）に住所・駅・施設名を渡す。自宅からの場合はシステム記載の自宅住所を origin に入れる。mode は transit(電車・既定)/driving(車)/walking(徒歩)/bicycling(自転車)。車/徒歩/自転車は所要時間を返す。電車は数値が返らず Google マップの経路リンク(mapsUrl)を返すので、それをユーザーに案内する。",
    input_schema: {
      type: "object",
      properties: {
        origin: { type: "string", description: "出発地（住所・駅・施設名）" },
        destination: { type: "string", description: "目的地（住所・駅・施設名）" },
        mode: {
          type: "string",
          enum: ["transit", "driving", "walking", "bicycling"],
          description: "移動手段（既定 transit）",
        },
      },
      required: ["origin", "destination"],
    },
  },
  {
    name: "list_tasks",
    description:
      "ユーザーの ToDo タスク一覧を取得する。『今日のタスクは?』『やることある?』『タスク見せて』などタスクの確認、または更新・完了のため対象を特定するときに呼ぶ。各タスクは id・title・status(todo/doing/done)・dueDate(YYYY-MM-DD or null) を持つ。これはカレンダー予定とは別物（時間の決まった予定は list_events、やること管理は list_tasks）。",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "create_task",
    description:
      "新しい ToDo タスクを作成する。『〇〇をやることに追加』『今日中に△△する』『タスクで覚えておいて』など、時間が決まっていない『やること』を頼まれたら呼ぶ。日時が明確な予定は create_event を使う。dueDate は期日（YYYY-MM-DD、『今日』なら本日の日付）。複数頼まれたら1つずつ呼ぶ。",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "タスク名" },
        notes: { type: "string", description: "メモ（任意）" },
        dueDate: { type: "string", description: "期日 YYYY-MM-DD（任意。今日なら本日の日付）" },
        status: {
          type: "string",
          enum: ["todo", "doing", "done"],
          description: "状態（既定 todo）",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "update_task",
    description:
      "既存タスクを更新する。『〇〇を完了にして』『△△は着手中』『期日を明日に』など。先に list_tasks で対象の id を特定する。status は todo(未着手)/doing(着手中)/done(完了)。変更するフィールドだけ渡す。",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "number", description: "対象タスクの id" },
        title: { type: "string" },
        notes: { type: "string" },
        dueDate: { type: "string", description: "期日 YYYY-MM-DD（null 文字列で期日なしに）" },
        status: { type: "string", enum: ["todo", "doing", "done"] },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_task",
    description:
      "タスクを削除する。破壊的操作なので実行前に対象を要約し確認を取ってから呼ぶ。先に list_tasks で id を特定する。",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "number", description: "対象タスクの id" },
      },
      required: ["id"],
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

  // 場所検索・移動時間はカレンダー連携に依存しない
  if (name === "find_places") {
    return searchPlaces({
      query: String(input.query),
      near: input.near ? String(input.near) : undefined,
      openNow: typeof input.openNow === "boolean" ? input.openNow : undefined,
    });
  }
  if (name === "travel_time") {
    return computeTravel({
      origin: String(input.origin),
      destination: String(input.destination),
      mode: input.mode ? (String(input.mode) as TravelMode) : undefined,
    });
  }

  // タスク(ToDo)はカレンダー連携に依存しない。userId が必要。
  if (name === "list_tasks" || name === "create_task" || name === "update_task" || name === "delete_task") {
    if (ctx.userId === undefined) {
      throw new Error("タスク機能を使うにはログインが必要です");
    }
    const userId = ctx.userId;
    switch (name) {
      case "list_tasks":
        return await listTasks(userId);
      case "create_task":
        return await createTask(userId, {
          title: String(input.title),
          notes: input.notes !== undefined ? String(input.notes) : undefined,
          dueDate: input.dueDate ? String(input.dueDate) : undefined,
          status: input.status ? (String(input.status) as TaskStatus) : undefined,
        });
      case "update_task": {
        const updated = await updateTask(userId, Number(input.id), {
          title: input.title !== undefined ? String(input.title) : undefined,
          notes: input.notes !== undefined ? String(input.notes) : undefined,
          dueDate:
            input.dueDate === undefined
              ? undefined
              : input.dueDate === null || input.dueDate === "null" || input.dueDate === ""
                ? null
                : String(input.dueDate),
          status: input.status ? (String(input.status) as TaskStatus) : undefined,
        });
        if (!updated) throw new Error(`タスク id=${input.id} が見つかりません`);
        return updated;
      }
      case "delete_task": {
        const ok = await deleteTask(userId, Number(input.id));
        if (!ok) throw new Error(`タスク id=${input.id} が見つかりません`);
        return { deleted: true, id: Number(input.id) };
      }
    }
  }

  if (ctx.accounts.length === 0) {
    throw new Error("連携中の Google アカウントがありません");
  }
  const account = input.account ? String(input.account) : undefined;

  if (name === "search_emails") {
    const acc = resolveAccount(ctx, account);
    if (!acc.gmail) {
      throw new Error(
        "Gmail が未連携です。一度ログアウトして再ログインし、同意画面で Gmail の閲覧許可にチェックしてください。",
      );
    }
    const emails = await searchEmails(acc.gmail, {
      query: input.query ? String(input.query) : undefined,
      maxResults: typeof input.maxResults === "number" ? input.maxResults : undefined,
    });
    return { account: acc.email, emails };
  }

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
