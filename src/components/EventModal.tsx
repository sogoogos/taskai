"use client";

import { useState } from "react";
import type { CalendarEventItem } from "./event";

/** ISO（タイムゾーン付き）→ datetime-local 入力値（ブラウザのローカル時刻） */
function toLocalInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

/** datetime-local 入力値 → カレンダー送信用（秒付き。タイムゾーンは API 側で Asia/Tokyo） */
function fromLocalInput(v: string): string | undefined {
  if (!v) return undefined;
  return `${v}:00`;
}

export default function EventModal({
  event,
  onClose,
  onChanged,
}: {
  event: CalendarEventItem;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [summary, setSummary] = useState(event.summary);
  const [start, setStart] = useState(toLocalInput(event.start));
  const [end, setEnd] = useState(toLocalInput(event.end));
  const [location, setLocation] = useState(event.location ?? "");
  const [description, setDescription] = useState(event.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/event", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: event.id,
          account: event.accountEmail,
          summary,
          location,
          description,
          // 終日予定は時刻を変えない（dateTime化を避ける）
          ...(event.allDay
            ? {}
            : { start: fromLocalInput(start), end: fromLocalInput(end) }),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "更新に失敗しました");
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm(`「${event.summary}」を削除しますか？`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/event", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: event.id, account: event.accountEmail }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "削除に失敗しました");
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold">予定の詳細・編集</h2>
          <button
            onClick={onClose}
            className="text-[var(--muted)] hover:text-[var(--text)]"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-[var(--muted)]">タイトル</label>
            <input
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            />
          </div>

          {event.allDay ? (
            <div className="text-xs text-[var(--muted)]">終日予定（日付の変更は未対応）</div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs text-[var(--muted)]">開始</label>
                <input
                  type="datetime-local"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-2 py-2 text-sm outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--muted)]">終了</label>
                <input
                  type="datetime-local"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-2 py-2 text-sm outline-none focus:border-[var(--accent)]"
                />
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs text-[var(--muted)]">場所</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--muted)]">メモ</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted)]">
            <span>
              {event.accountEmail ? `📅 ${event.accountEmail}` : ""}
              {event.recurrence ? "・繰り返し" : ""}
            </span>
            {event.htmlLink && (
              <a
                href={event.htmlLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--accent)] underline"
              >
                Googleカレンダーで開く
              </a>
            )}
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              onClick={remove}
              disabled={busy}
              className="rounded-xl border border-red-500/50 px-3 py-2 text-sm text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
            >
              削除
            </button>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                disabled={busy}
                className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm transition hover:bg-[var(--surface-2)] disabled:opacity-50"
              >
                閉じる
              </button>
              <button
                onClick={save}
                disabled={busy}
                className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
