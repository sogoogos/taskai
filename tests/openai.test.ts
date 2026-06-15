import { describe, it, expect, vi } from "vitest";
import { runOpenAI, type OpenAIChatClient } from "@/lib/llm/openai";
import { makeFakeCalendar } from "./helpers/fakeCalendar";
import type { NeutralMessage } from "@/lib/llm/types";

const history: NeutralMessage[] = [
  { role: "user", content: "毎日19時からAIの勉強を1時間入れて" },
];

// OpenAI 風のアシスタントメッセージを作る
function assistantToolCall(name: string, args: Record<string, unknown>, id = "call_1") {
  return {
    choices: [
      {
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            { id, type: "function", function: { name, arguments: JSON.stringify(args) } },
          ],
        },
      },
    ],
  };
}
function assistantText(text: string) {
  return { choices: [{ message: { role: "assistant", content: text } }] };
}

function mockClient(responses: unknown[]): {
  client: OpenAIChatClient;
  create: ReturnType<typeof vi.fn>;
  messagesAt: (i: number) => unknown[];
} {
  const queue = [...responses];
  const snapshots: unknown[][] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const create = vi.fn(async (body: any) => {
    snapshots.push(structuredClone(body.messages));
    const next = queue.shift();
    if (!next) throw new Error("モック応答が尽きました");
    return next;
  });
  return {
    client: { chat: { completions: { create } } },
    create,
    messagesAt: (i) => snapshots[i],
  };
}

describe("runOpenAI", () => {
  it("tool_call→終了 で予定を作成し最終テキストを返す", async () => {
    const { client } = mockClient([
      assistantToolCall("create_event", {
        summary: "AIの勉強",
        start: "2026-06-15T19:00:00+09:00",
        end: "2026-06-15T20:00:00+09:00",
        recurrence: ["RRULE:FREQ=DAILY"],
      }),
      assistantText("毎日19時にAIの勉強を登録しました。"),
    ]);
    const { ctx, insert } = makeFakeCalendar();
    const tools: string[] = [];

    const result = await runOpenAI({
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

  it("2回目の呼び出しに tool role のメッセージが渡る", async () => {
    const { client, messagesAt } = mockClient([
      assistantToolCall("list_events", {
        timeMin: "2026-06-15T00:00:00+09:00",
        timeMax: "2026-06-22T00:00:00+09:00",
      }),
      assistantText("今週は予定がありません。"),
    ]);
    const { ctx } = makeFakeCalendar({ list: [] });

    await runOpenAI({ client, context: ctx, system: "sys", history });

    const secondMessages = messagesAt(1);
    const toolMsg = secondMessages[secondMessages.length - 1] as {
      role: string;
      tool_call_id: string;
    };
    expect(toolMsg.role).toBe("tool");
    expect(toolMsg.tool_call_id).toBe("call_1");
  });

  it("system と履歴が先頭に積まれる", async () => {
    const { client, create } = mockClient([assistantText("こんにちは")]);
    const { ctx } = makeFakeCalendar();
    await runOpenAI({ client, context: ctx, system: "SYS", history });
    const messages = create.mock.calls[0][0].messages;
    expect(messages[0]).toEqual({ role: "system", content: "SYS" });
    expect(messages[1]).toMatchObject({ role: "user" });
  });
});
