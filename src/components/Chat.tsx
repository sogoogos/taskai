"use client";

import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

type Provider = "claude" | "openai" | "gemini";

const PROVIDER_LABELS: Record<Provider, string> = {
  claude: "Claude (Haiku 4.5)",
  openai: "OpenAI (GPT-4o-mini)",
  gemini: "Gemini (2.5 Flash)",
};

const SUGGESTIONS = [
  "毎日19時からAIの勉強を1時間入れて",
  "毎日21時から事業戦略かネットワークの勉強を1時間入れて",
  "今週の予定を教えて",
];

// 予定・タスクを変更するツール（実行後に右パネルを再読込する）
const MUTATING_TOOLS = new Set([
  "create_event",
  "update_event",
  "delete_event",
  "create_task",
  "update_task",
  "delete_task",
]);

export default function Chat({
  defaultProvider = "claude",
  onCalendarChanged,
}: {
  defaultProvider?: Provider;
  onCalendarChanged?: () => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [toolNote, setToolNote] = useState<string | null>(null);
  const [provider, setProvider] = useState<Provider>(defaultProvider);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    });
  };

  async function send(text: string) {
    if (!text.trim() || busy) return;
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    setToolNote(null);
    scrollToBottom();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, provider }),
      });
      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "通信エラー");
        setMessages((m) => [...m, { role: "assistant", content: `エラー: ${errText}` }]);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";
      let mutated = false;

      // 受信ごとに SSE をパース
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const evLine = part.split("\n").find((l) => l.startsWith("event: "));
          const dataLine = part.split("\n").find((l) => l.startsWith("data: "));
          if (!evLine || !dataLine) continue;
          const ev = evLine.slice(7).trim();
          const data = JSON.parse(dataLine.slice(6));
          if (ev === "text") {
            assistantText = data.text;
            setMessages((m) => {
              const base = m[m.length - 1]?.role === "assistant" ? m.slice(0, -1) : m;
              return [...base, { role: "assistant", content: assistantText }];
            });
            scrollToBottom();
          } else if (ev === "tool") {
            setToolNote(`カレンダー操作中: ${data.name}`);
            if (MUTATING_TOOLS.has(data.name)) mutated = true;
          } else if (ev === "error") {
            setMessages((m) => [...m, { role: "assistant", content: `エラー: ${data.message}` }]);
          }
        }
      }
      // 予定を変更するツールが実行されたらアジェンダを再読込
      if (mutated) onCalendarChanged?.();
    } finally {
      setBusy(false);
      setToolNote(null);
      scrollToBottom();
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] p-2.5">
        <span className="text-xs text-[var(--muted)]">AIモデル</span>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as Provider)}
          disabled={busy}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-xs outline-none focus:border-[var(--accent)] disabled:opacity-60"
        >
          {(Object.keys(PROVIDER_LABELS) as Provider[]).map((p) => (
            <option key={p} value={p}>
              {PROVIDER_LABELS[p]}
            </option>
          ))}
        </select>
      </div>
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="text-sm text-[var(--muted)]">
            <p className="mb-3">予定について話しかけてください。例:</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-[var(--border)] px-3 py-1 text-left transition hover:bg-[var(--surface-2)]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
          >
            <div
              className={
                "max-w-[85%] rounded-2xl px-4 py-2 text-sm " +
                (m.role === "user"
                  ? "whitespace-pre-wrap bg-[var(--accent)] text-white"
                  : "bg-[var(--surface-2)] text-[var(--text)]")
              }
            >
              {m.role === "assistant" ? (
                <div className="md">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: (props) => (
                        <a {...props} target="_blank" rel="noopener noreferrer" />
                      ),
                    }}
                  >
                    {m.content}
                  </ReactMarkdown>
                </div>
              ) : (
                m.content
              )}
            </div>
          </div>
        ))}
        {toolNote && <div className="text-xs text-[var(--muted)]">{toolNote}</div>}
        {busy && !toolNote && (
          <div className="text-xs text-[var(--muted)]">考え中…</div>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2 border-t border-[var(--border)] p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="例: 明日の15時に歯医者を入れて"
          disabled={busy}
          className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 text-sm outline-none focus:border-[var(--accent)] disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          送信
        </button>
      </form>
    </section>
  );
}
