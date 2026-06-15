import { vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import type { MessagesClient } from "@/lib/claude";

export function textBlock(text: string): Anthropic.TextBlock {
  return { type: "text", text, citations: null } as Anthropic.TextBlock;
}

export function toolUseBlock(
  name: string,
  input: Record<string, unknown>,
  id = `tu_${name}`,
): Anthropic.ToolUseBlock {
  return { type: "tool_use", id, name, input } as Anthropic.ToolUseBlock;
}

export function message(
  content: Anthropic.ContentBlock[],
  stop_reason: Anthropic.Message["stop_reason"],
): Anthropic.Message {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-opus-4-8",
    content,
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0 },
  } as Anthropic.Message;
}

/** 用意した応答を順番に返すモック。
 *  runAgent は messages 配列を変異させるため、呼び出し時点のスナップショットを保持する。 */
export function makeMockAnthropic(responses: Anthropic.Message[]): {
  client: MessagesClient;
  create: ReturnType<typeof vi.fn>;
  /** i 回目の create 呼び出し時点の messages のディープコピー */
  messagesAt: (i: number) => Anthropic.MessageParam[];
} {
  const queue = [...responses];
  const snapshots: Anthropic.MessageParam[][] = [];
  const create = vi.fn(async (body: Anthropic.MessageCreateParamsNonStreaming) => {
    snapshots.push(structuredClone(body.messages));
    const next = queue.shift();
    if (!next) throw new Error("モック応答が尽きました");
    return next;
  });
  return {
    client: { messages: { create } },
    create,
    messagesAt: (i) => snapshots[i],
  };
}
