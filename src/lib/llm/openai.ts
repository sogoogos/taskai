import { calendarTools, executeTool } from "../tools";
import type { CalendarContext } from "../calendar";
import type { NeutralMessage, RunResult } from "./types";

export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const MAX_TURNS = 10;

/** OpenAI Chat Completions の最小インターフェース（テストでモックしやすい） */
export interface OpenAIChatClient {
  chat: {
    completions: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create(body: any): Promise<any>;
    };
  };
}

/** calendarTools を OpenAI の function tool 形式へ変換 */
function toOpenAITools() {
  return calendarTools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

export async function runOpenAI(params: {
  client: OpenAIChatClient;
  model?: string;
  context: CalendarContext;
  system: string;
  history: NeutralMessage[];
  onText?: (text: string) => void;
  onTool?: (name: string, input: unknown) => void;
}): Promise<RunResult> {
  const model = params.model ?? process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [
    { role: "system", content: params.system },
    ...params.history.map((m) => ({ role: m.role, content: m.content })),
  ];
  const tools = toOpenAITools();
  const toolCalls: { name: string; input: unknown }[] = [];
  let finalText = "";

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await params.client.chat.completions.create({
      model,
      messages,
      tools,
      tool_choice: "auto",
    });
    const msg = res.choices[0].message;

    if (msg.content) {
      finalText = msg.content;
      params.onText?.(msg.content);
    }
    // アシスタント応答（tool_calls 含む）を履歴へ
    messages.push(msg);

    const calls = msg.tool_calls ?? [];
    if (calls.length === 0) break;

    for (const tc of calls) {
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(tc.function.arguments || "{}");
      } catch {
        input = {};
      }
      params.onTool?.(tc.function.name, input);
      toolCalls.push({ name: tc.function.name, input });
      try {
        const result = await executeTool(params.context, tc.function.name, input);
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: `エラー: ${message}`,
        });
      }
    }
  }

  return { finalText, toolCalls };
}
