"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { badgeColor } from "./colors";
import type { CalendarEventItem } from "./event";
import EventModal from "./EventModal";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function todayStr(): string {
  return ymd(new Date());
}

/** dateStr を含む週の月曜日（YYYY-MM-DD） */
function mondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  const dow = d.getDay(); // 0=日
  const diff = dow === 0 ? -6 : 1 - dow; // 月曜まで戻す
  d.setDate(d.getDate() + diff);
  return ymd(d);
}

function shiftDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return ymd(d);
}

function hhmm(iso?: string): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso),
  );
}

/** 予定がどのローカル日付に属するか（終日は start の日付） */
function eventDay(ev: CalendarEventItem): string {
  if (!ev.start) return "";
  if (ev.allDay) return ev.start.slice(0, 10);
  return ymd(new Date(ev.start));
}

export default function WeekView({
  reloadSignal = 0,
  onCalendarChanged,
}: {
  reloadSignal?: number;
  onCalendarChanged?: () => void;
}) {
  const [weekStart, setWeekStart] = useState<string>(mondayOf(todayStr()));
  const [events, setEvents] = useState<CalendarEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CalendarEventItem | null>(null);

  const load = useCallback(async (ws: string) => {
    setLoading(true);
    setError(null);
    try {
      const from = new Date(`${ws}T00:00:00`).toISOString();
      const to = new Date(`${shiftDays(ws, 7)}T00:00:00`).toISOString();
      const res = await fetch(
        `/api/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "取得に失敗しました");
      setEvents(data.events ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(weekStart);
  }, [load, weekStart, reloadSignal]);

  const days = useMemo(() => {
    const today = todayStr();
    return Array.from({ length: 7 }, (_, i) => {
      const dateStr = shiftDays(weekStart, i);
      const d = new Date(`${dateStr}T00:00:00`);
      const dow = d.getDay();
      const dayEvents = events
        .filter((e) => eventDay(e) === dateStr)
        .sort((a, b) => {
          if (a.allDay !== b.allDay) return a.allDay ? -1 : 1; // 終日を先頭
          return (a.start ?? "").localeCompare(b.start ?? "");
        });
      return { dateStr, dow, dayEvents, isToday: dateStr === today };
    });
  }, [weekStart, events]);

  const weekEnd = shiftDays(weekStart, 6);
  const label = `${weekStart.slice(5).replace("-", "/")}〜${weekEnd.slice(5).replace("-", "/")}`;
  const isThisWeek = weekStart === mondayOf(todayStr());

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 週ナビ */}
      <div className="flex items-center justify-between gap-1 border-b border-[var(--border)] px-3 py-2">
        <button
          onClick={() => setWeekStart((w) => shiftDays(w, -7))}
          className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs transition hover:bg-[var(--surface-2)]"
          aria-label="前の週"
        >
          ◀
        </button>
        <span className="flex-1 text-center text-xs font-semibold">{label}</span>
        <button
          onClick={() => setWeekStart((w) => shiftDays(w, 7))}
          className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs transition hover:bg-[var(--surface-2)]"
          aria-label="次の週"
        >
          ▶
        </button>
        <button
          onClick={() => setWeekStart(mondayOf(todayStr()))}
          disabled={isThisWeek}
          className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs transition hover:bg-[var(--surface-2)] disabled:opacity-40"
        >
          今週
        </button>
        <button
          onClick={() => load(weekStart)}
          disabled={loading}
          className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)] transition hover:bg-[var(--surface-2)] disabled:opacity-40"
          aria-label="更新"
          title="更新"
        >
          ⟳
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {loading && <p className="text-xs text-[var(--muted)]">読み込み中…</p>}
        {error && <p className="text-xs text-red-400">{error}</p>}
        {!loading && !error && (
          <div className="space-y-3">
            {days.map(({ dateStr, dow, dayEvents, isToday }) => (
              <div key={dateStr}>
                <div className="mb-1 flex items-center gap-1.5">
                  <span
                    className="text-xs font-semibold"
                    style={{
                      color:
                        dow === 0 ? "#f87171" : dow === 6 ? "#60a5fa" : "var(--text)",
                    }}
                  >
                    {Number(dateStr.slice(8))}日({WEEKDAYS[dow]})
                  </span>
                  {isToday && (
                    <span className="rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-medium text-white">
                      今日
                    </span>
                  )}
                </div>
                {dayEvents.length === 0 ? (
                  <p className="pl-1 text-[11px] text-[var(--muted)]">—</p>
                ) : (
                  <div className="space-y-1">
                    {dayEvents.map((ev) => (
                      <button
                        key={`${ev.accountEmail}-${ev.id}`}
                        onClick={() => setSelected(ev)}
                        className="flex w-full items-start gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-left transition hover:border-[var(--accent)]"
                      >
                        <span
                          className="mt-1 h-2 w-2 shrink-0 rounded-full"
                          style={{ background: badgeColor(ev.accountEmail) }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs">{ev.summary}</span>
                          <span className="block text-[10px] text-[var(--muted)]">
                            {ev.allDay ? "終日" : `${hhmm(ev.start)}–${hhmm(ev.end)}`}
                            {ev.location ? ` ・${ev.location}` : ""}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <EventModal
          event={selected}
          onClose={() => setSelected(null)}
          onChanged={() => {
            load(weekStart);
            onCalendarChanged?.();
          }}
        />
      )}
    </div>
  );
}
