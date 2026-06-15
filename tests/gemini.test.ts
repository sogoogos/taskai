import { describe, it, expect, vi } from "vitest";
import { runGemini, type GeminiClient } from "@/lib/llm/gemini";
import { makeFakeCalendar } from "./helpers/fakeCalendar";
import type { NeutralMessage } from "@/lib/llm/types";

const history: NeutralMessage[] = [
  { role: "user", content: "毎日19時からAIの勉強を1時間入れて" },
];

function fnCall(name: string, args: Record<string, unknown>) {
  return { functionCalls: [{ name, args }] };
}
function textResp(text: string) {
  return { text, functionCalls: [] };
}

function mockClient(responses: unknown[]): {
  client: GeminiClient;
  generate: ReturnType<typeof vi.fn>;
  contentsAt: (i: number) => unknown[];
  configAt: (i: number) => { systemInstruction: string; tools: { functionDeclarations: unknown[] }[] };
} {
  const queue = [...responses];
  const contentSnapshots: unknown[][] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const configSnapshots: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const generate = vi.fn(async (body: any) => {
    contentSnapshots.push(structuredClone(body.contents));
    configSnapshots.push(body.config);
    const next = queue.shift();
    if (!next) throw new Error("モック応答が尽きました");
    return next;
  });
  return {
    client: { models: { generateContent: generate } },
    generate,
    contentsAt: (i) => contentSnapshots[i],
    configAt: (i) => configSnapshots[i],
  };
}

describe("runGemini", () => {
  it("functionCall→終了 で予定を作成し最終テキストを返す", async () => {
    const { client } = mockClient([
      fnCall("create_event", {
        summary: "AIの勉強",
        start: "2026-06-15T19:00:00+09:00",
        end: "2026-06-15T20:00:00+09:00",
        recurrence: ["RRULE:FREQ=DAILY"],
      }),
      textResp("毎日19時にAIの勉強を登録しました。"),
    ]);
    const { ctx, insert } = makeFakeCalendar();
    const tools: string[] = [];

    const result = await runGemini({
      client,
      context: ctx,
      system: "sys",
      history,
      onTool: (n) => tools.push(n),
    });

    expect(insert).toHaveBeenCalledOnce();
    expect(insert.mock.calls[0][0].requestBody.recurrence).toEqual(["RRULE:FREQ=DAILY"]);
    expect(tools).toEqual(["create_event"]);
    expect(result.finalText).toContain("登録しました");
    expect(result.toolCalls[0].name).toBe("create_event");
  });

  it("functionResponse が次の contents に積まれ、systemInstruction を渡す", async () => {
    const { client, contentsAt, configAt } = mockClient([
      fnCall("list_events", {
        timeMin: "2026-06-15T00:00:00+09:00",
        timeMax: "2026-06-22T00:00:00+09:00",
      }),
      textResp("今週は予定がありません。"),
    ]);
    const { ctx } = makeFakeCalendar({ list: [] });

    await runGemini({ client, context: ctx, system: "SYS", history });

    // 1回目に systemInstruction と functionDeclarations が渡る
    const firstConfig = configAt(0);
    expect(firstConfig.systemInstruction).toBe("SYS");
    expect(firstConfig.tools[0].functionDeclarations.length).toBeGreaterThan(0);

    // 2回目の contents 末尾に functionResponse が入る
    const secondContents = contentsAt(1) as {
      role: string;
      parts: { functionResponse?: { name: string } }[];
    }[];
    const last = secondContents[secondContents.length - 1];
    expect(last.role).toBe("user");
    expect(last.parts[0].functionResponse?.name).toBe("list_events");
  });
});
