import { calendarTools, executeTool } from "../tools";
import type { CalendarContext } from "../calendar";
import type { NeutralMessage, RunResult } from "./types";

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const MAX_TURNS = 10;

interface GeminiFunctionCall {
  name?: string;
  args?: Record<string, unknown>;
}

/** @google/genai の最小インターフェース（テストでモックしやすい） */
export interface GeminiClient {
  models: {
    generateContent(body: {
      model: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      contents: any[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      config?: any;
    }): Promise<{ text?: string; functionCalls?: GeminiFunctionCall[] }>;
  };
}

function toFunctionDeclarations() {
  return calendarTools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.input_schema,
  }));
}

export async function runGemini(params: {
  client: GeminiClient;
  model?: string;
  context: CalendarContext;
  system: string;
  history: NeutralMessage[];
  onText?: (text: string) => void;
  onTool?: (name: string, input: unknown) => void;
}): Promise<RunResult> {
  const model = params.model ?? process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contents: any[] = params.history.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const config = {
    systemInstruction: params.system,
    tools: [{ functionDeclarations: toFunctionDeclarations() }],
  };
  const toolCalls: { name: string; input: unknown }[] = [];
  let finalText = "";

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await params.client.models.generateContent({ model, contents, config });
    const calls = res.functionCalls ?? [];
    const text = res.text ?? "";

    if (text) {
      finalText = text;
      params.onText?.(text);
    }

    // モデルターンを履歴へ（テキスト + functionCall）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const modelParts: any[] = [];
    if (text) modelParts.push({ text });
    for (const c of calls) modelParts.push({ functionCall: { name: c.name, args: c.args ?? {} } });
    contents.push({ role: "model", parts: modelParts });

    if (calls.length === 0) break;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const responseParts: any[] = [];
    for (const c of calls) {
      if (!c.name) continue; // 名前なしの functionCall は無視
      const name = c.name;
      const input = c.args ?? {};
      params.onTool?.(name, input);
      toolCalls.push({ name, input });
      try {
        const result = await executeTool(params.context, name, input);
        responseParts.push({
          functionResponse: { name, response: { result } },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        responseParts.push({
          functionResponse: { name, response: { error: message } },
        });
      }
    }
    contents.push({ role: "user", parts: responseParts });
  }

  return { finalText, toolCalls };
}
