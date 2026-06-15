import Anthropic from "@anthropic-ai/sdk";
import { calendarTools, executeTool } from "./tools";
import { DEFAULT_TIMEZONE, type CalendarContext } from "./calendar";

export const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5";
const MAX_TOKENS = 4096;
const MAX_TURNS = 10; // 無限ループ防止

/** 動的な現在時刻・ユーザー情報を含む system プロンプトを生成 */
export function buildSystemPrompt(opts: {
  now: Date;
  timezone?: string;
  email?: string;
  accounts?: string[]; // 連携中アカウントのメール（先頭=既定）
  homeAddress?: string | null;
  note?: string | null;
}): string {
  const tz = opts.timezone ?? DEFAULT_TIMEZONE;
  const nowStr = new Intl.DateTimeFormat("ja-JP", {
    timeZone: tz,
    dateStyle: "full",
    timeStyle: "short",
  }).format(opts.now);

  const accounts = opts.accounts ?? (opts.email ? [opts.email] : []);
  const multi = accounts.length > 1;

  return [
    "あなたは TaskAI、ユーザーの予定とタスクを管理するアシスタントです。",
    "Google カレンダー操作ツール（list_events / create_event / update_event / delete_event）、場所検索 find_places、移動時間 travel_time を使えます。",
    "",
    `現在日時: ${nowStr}（タイムゾーン ${tz}）`,
    opts.email ? `ユーザー: ${opts.email}` : "",
    accounts.length > 0
      ? `連携中アカウント: ${accounts.join(", ")}（先頭が既定）`
      : "",
    opts.homeAddress ? `ユーザーの自宅住所: ${opts.homeAddress}` : "",
    opts.note ? `ユーザーの状況メモ: ${opts.note}` : "",
    "",
    "## 行動指針",
    "- 日時はこのタイムゾーンの ISO8601（例 2026-06-15T15:00:00+09:00）で扱う。『明日』『来週』等は現在日時から解決する。",
    "- 日時や長さが曖昧なときは作成せず、まず簡潔に確認する。",
    "- 『毎日』『毎週』など繰り返しは recurrence に RRULE を入れる（毎日=RRULE:FREQ=DAILY、平日=RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR）。",
    "- 更新・削除は先に list_events で対象を特定する。削除など破壊的操作は実行前に対象を要約しユーザーの確認を取る。",
    "- 予定を探すとき、query での絞り込みは表記揺れで漏れるので原則使わず、まず期間だけで list_events して結果から該当を探す。『今日』でも見つからなければ前後数日に広げて再取得する。list_events がエラーを返したら『予定なし』ではなく取得失敗として扱い、その旨を伝える。",
    "- カフェや店など場所を尋ねられたら find_places を使う。基準地点が予定に紐づくなら、その予定の場所を near に渡す。Wi-Fi/電源/混雑は取得できないので、その点は一般的な助言として補い、必要なら確認を促す。",
    "- 移動時間や『間に合うか』を尋ねられたら travel_time を使う。出発地が明示されず『家から』等なら自宅住所を origin に使う。自宅住所が未登録で出発地が不明なら、設定（⚙）での登録を促すか出発地を尋ねる。予定の前後の移動なら、その予定の場所と時刻を踏まえて余裕の有無も助言する。",
    multi
      ? "- 複数アカウント連携中。list_events は account 省略で全アカウント集約（各予定に accountEmail）。更新/削除はその予定の accountEmail を account に必ず渡す。作成先が曖昧なら確認するか既定に入れ、どのアカウントに入れたか伝える。予定を提示するときはどのアカウントかも示す。"
      : "",
    "",
    "## 体力・健康への配慮（重要）",
    "- 予定を提案・作成する際はユーザーの体力やスタミナを考慮し、助言を添える（ただし最終的な意図は尊重する）。",
    "- 高負荷の予定を連続させない。間に休憩や軽めの作業を挟むよう勧める。",
    "- 夜遅い時間に集中力を要する作業（勉強・重要会議）を置かないよう注意する。",
    "- 1日の総負荷が高すぎる場合は警告し、再配置を提案する。",
    "- 特に『お酒を含む会食』が多い・連続するときは明確に注意・警告し、翌日を軽めにする/間隔を空ける/頻度を抑える等を提案する。",
    "",
    "回答は日本語で簡潔に。操作後は何をしたかを一言で伝える。",
  ]
    .filter(Boolean)
    .join("\n");
}

/** messages.create だけを使う最小インターフェース（テストでモックしやすい） */
export interface MessagesClient {
  messages: {
    create(body: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
  };
}

export interface RunAgentResult {
  finalText: string;
  toolCalls: { name: string; input: unknown }[];
  messages: Anthropic.MessageParam[];
}

/**
 * エージェントループ本体。
 * client と calendar を引数で受けるため、テストでは両方モックできる。
 * onText は各アシスタントターンのテキストを逐次通知する（SSE 用）。
 */
export async function runAgent(params: {
  client: MessagesClient;
  context: CalendarContext;
  system: string;
  history: Anthropic.MessageParam[];
  onText?: (text: string) => void;
  onTool?: (name: string, input: unknown) => void;
}): Promise<RunAgentResult> {
  const messages: Anthropic.MessageParam[] = [...params.history];
  const toolCalls: { name: string; input: unknown }[] = [];
  let finalText = "";

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await params.client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: params.system,
      tools: calendarTools,
      messages,
    });

    // テキスト収集
    const turnText = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    if (turnText) {
      finalText = turnText;
      params.onText?.(turnText);
    }

    // アシスタントの応答（tool_use 含む）を履歴へ
    messages.push({ role: "assistant", content: res.content });

    if (res.stop_reason !== "tool_use") {
      break;
    }

    const toolUseBlocks = res.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      params.onTool?.(block.name, block.input);
      toolCalls.push({ name: block.name, input: block.input });
      try {
        const result = await executeTool(
          params.context,
          block.name,
          block.input as Record<string, unknown>,
        );
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `エラー: ${message}`,
          is_error: true,
        });
      }
    }

    messages.push({ role: "user", content: toolResults });
  }

  return { finalText, toolCalls, messages };
}

/** 本番用 Anthropic クライアント */
export function createAnthropic(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY が未設定です（.env.local を確認）");
  return new Anthropic({ apiKey });
}
