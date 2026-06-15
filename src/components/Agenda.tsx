"use client";

import { useEffect, useState, useCallback } from "react";
import { badgeColor } from "./colors";

interface EventItem {
  id: string;
  summary: string;
  start?: string;
  end?: string;
  allDay: boolean;
  location?: string;
  recurrence?: string[];
  accountEmail?: string;
}

interface AccountItem {
  id: number;
  email: string;
  isPrimary: boolean;
}

function formatWhen(ev: EventItem): string {
  if (!ev.start) return "";
  if (ev.allDay) {
    return new Intl.DateTimeFormat("ja-JP", {
      month: "numeric",
      day: "numeric",
      weekday: "short",
    }).format(new Date(ev.start));
  }
  const d = new Date(ev.start);
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

interface Warning {
  email: string;
  message: string;
}

export default function Agenda({ reloadSignal = 0 }: { reloadSignal?: number }) {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [evRes, accRes] = await Promise.all([
        fetch("/api/events"),
        fetch("/api/accounts"),
      ]);
      const data = await evRes.json();
      if (!evRes.ok) throw new Error(data.error ?? "取得に失敗しました");
      setEvents(data.events ?? []);
      setWarnings(data.warnings ?? []);
      if (accRes.ok) {
        const accData = await accRes.json();
        setAccounts(accData.accounts ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, reloadSignal]);

  const multi = accounts.length > 1;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
        <span className="text-xs text-[var(--muted)]">直近2週間</span>
        <button
          onClick={load}
          className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)] transition hover:bg-[var(--surface-2)]"
        >
          更新
        </button>
      </div>
      {accounts.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--border)] px-3 py-2">
          {accounts.map((a) => (
            <span
              key={a.id}
              className="flex items-center gap-1 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11px]"
              title={a.email}
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: badgeColor(a.email) }}
              />
              {a.email.split("@")[0]}
              {a.isPrimary ? "（主）" : ""}
            </span>
          ))}
          <a
            href="/api/auth/google?add=1"
            className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--muted)] transition hover:bg-[var(--surface-2)]"
          >
            ＋追加
          </a>
        </div>
      )}
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {warnings.map((w) => (
          <div
            key={w.email}
            className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-300"
          >
            <div className="font-medium">{w.email} は読み込めませんでした</div>
            <div className="mt-0.5 opacity-80">
              カレンダー権限が不足している可能性があります。
              <a href="/api/auth/google?add=1" className="underline">
                再連携
              </a>
              （同意画面でカレンダーにチェック）してください。
            </div>
          </div>
        ))}
        {loading && <p className="text-xs text-[var(--muted)]">読み込み中…</p>}
        {error && <p className="text-xs text-red-400">{error}</p>}
        {!loading && !error && events.length === 0 && (
          <p className="text-xs text-[var(--muted)]">予定はありません</p>
        )}
        {events.map((ev) => (
          <div
            key={ev.id}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-2.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="text-sm font-medium">{ev.summary}</div>
              {multi && ev.accountEmail && (
                <span
                  className="mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] text-white"
                  style={{ background: badgeColor(ev.accountEmail) }}
                  title={ev.accountEmail}
                >
                  {ev.accountEmail.split("@")[0]}
                </span>
              )}
            </div>
            <div className="mt-0.5 text-xs text-[var(--muted)]">
              {formatWhen(ev)}
              {ev.recurrence ? " ・繰り返し" : ""}
            </div>
            {ev.location && (
              <div className="mt-0.5 text-xs text-[var(--muted)]">📍 {ev.location}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
