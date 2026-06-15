import { type NextRequest } from "next/server";
import { getSession, accountIdsOf } from "@/lib/session";
import { calendarAccountsForIds } from "@/lib/google";
import { getProfile } from "@/lib/db";
import { buildSystemPrompt } from "@/lib/claude";
import {
  runWithProvider,
  defaultProviderId,
  isProviderId,
  humanizeProviderError,
  type NeutralMessage,
} from "@/lib/llm";

export const runtime = "nodejs";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.userId) {
    return new Response("未ログインです", { status: 401 });
  }

  let body: { messages?: ChatMessage[]; provider?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("不正なリクエスト", { status: 400 });
  }
  const incoming = body.messages ?? [];
  if (incoming.length === 0) {
    return new Response("メッセージがありません", { status: 400 });
  }

  const providerId = isProviderId(body.provider) ? body.provider : defaultProviderId();

  const history: NeutralMessage[] = incoming.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const accounts = await calendarAccountsForIds(accountIdsOf(session));
  const profile = await getProfile(session.userId);
  const system = buildSystemPrompt({
    now: new Date(),
    email: session.email,
    accounts: accounts.map((a) => a.email),
    homeAddress: profile.homeAddress,
    note: profile.note,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };
      try {
        if (accounts.length === 0) {
          throw new Error("連携中の Google アカウントがありません。再ログインしてください");
        }
        await runWithProvider(providerId, {
          context: { accounts, userId: session.userId },
          system,
          history,
          onText: (text) => send("text", { text }),
          onTool: (name, input) => send("tool", { name, input }),
        });
        send("done", { provider: providerId });
      } catch (err) {
        console.error("[chat] error:", err instanceof Error ? err.message : err);
        send("error", { message: humanizeProviderError(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
