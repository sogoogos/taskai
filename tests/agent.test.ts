import { describe, it, expect } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { runAgent } from "@/lib/claude";
import { makeFakeCalendar } from "./helpers/fakeCalendar";
import {
  makeMockAnthropic,
  message,
  textBlock,
  toolUseBlock,
} from "./helpers/mockAnthropic";

const history: Anthropic.MessageParam[] = [
  { role: "user", content: "毎日19時からAIの勉強を1時間入れて" },
];

describe("runAgent エージェントループ", () => {
  it("tool_use→end_turn で予定を作成し最終テキストを返す", async () => {
    const { client, create } = makeMockAnthropic([
      message(
        [
          toolUseBlock("create_event", {
            summary: "AIの勉強",
            start: "2026-06-15T19:00:00+09:00",
            end: "2026-06-15T20:00:00+09:00",
            recurrence: ["RRULE:FREQ=DAILY"],
          }),
        ],
        "tool_use",
      ),
      message([textBlock("毎日19時にAIの勉強を登録しました。")], "end_turn"),
    ]);
    const { ctx, insert } = makeFakeCalendar();

    const texts: string[] = [];
    const tools: string[] = [];
    const result = await runAgent({
      client,
      context: ctx,
      system: "sys",
      history,
      onText: (t) => texts.push(t),
      onTool: (n) => tools.push(n),
    });

    // カレンダー作成が呼ばれた
    expect(insert).toHaveBeenCalledOnce();
    expect(insert.mock.calls[0][0].requestBody.recurrence).toEqual([
      "RRULE:FREQ=DAILY",
    ]);
    // ツール実行とコールバック
    expect(tools).toEqual(["create_event"]);
    expect(result.toolCalls.map((t) => t.name)).toEqual(["create_event"]);
    // 最終テキスト
    expect(result.finalText).toContain("登録しました");
    expect(texts).toContain("毎日19時にAIの勉強を登録しました。");
  });

  it("2回目の create に tool_result が渡る", async () => {
    const { client, messagesAt } = makeMockAnthropic([
      message([toolUseBlock("list_events", {
        timeMin: "2026-06-15T00:00:00+09:00",
        timeMax: "2026-06-22T00:00:00+09:00",
      })], "tool_use"),
      message([textBlock("今週は予定がありません。")], "end_turn"),
    ]);
    const { ctx } = makeFakeCalendar({ list: [] });

    await runAgent({ client, context: ctx, system: "sys", history });

    // 2回目の呼び出し時点の messages に tool_result が含まれる
    const secondCallMessages = messagesAt(1);
    const last = secondCallMessages[secondCallMessages.length - 1];
    expect(last.role).toBe("user");
    const content = last.content as Anthropic.ToolResultBlockParam[];
    expect(content[0].type).toBe("tool_result");
  });

  it("ツール失敗時は is_error の tool_result を返して継続する", async () => {
    const { client, messagesAt } = makeMockAnthropic([
      message([toolUseBlock("delete_event", { eventId: "bad" })], "tool_use"),
      message([textBlock("削除できませんでした。")], "end_turn"),
    ]);
    // delete が失敗する fake
    const fake = makeFakeCalendar();
    (fake.del as unknown as { mockRejectedValueOnce: (e: Error) => void }).mockRejectedValueOnce(
      new Error("not found"),
    );

    const result = await runAgent({
      client,
      context: fake.ctx,
      system: "sys",
      history,
    });

    const secondCallMessages = messagesAt(1);
    const toolResultMsg = secondCallMessages[secondCallMessages.length - 1];
    const content = toolResultMsg.content as Anthropic.ToolResultBlockParam[];
    expect(content[0].is_error).toBe(true);
    expect(String(content[0].content)).toContain("not found");
    // ループは継続し最終テキストが返る
    expect(result.finalText).toContain("削除できませんでした");
  });

  it("ツール無し(end_turn)なら即座にテキストを返す", async () => {
    const { client, create } = makeMockAnthropic([
      message([textBlock("こんにちは！何をしましょうか?")], "end_turn"),
    ]);
    const { ctx, insert } = makeFakeCalendar();
    const result = await runAgent({ client, context: ctx, system: "sys", history });
    expect(create).toHaveBeenCalledOnce();
    expect(insert).not.toHaveBeenCalled();
    expect(result.toolCalls).toEqual([]);
    expect(result.finalText).toContain("こんにちは");
  });
});
