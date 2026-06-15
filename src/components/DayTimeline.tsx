"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { badgeColor } from "./colors";

interface EventItem {
  id: string;
  summary: string;
  start?: string;
  end?: string;
  allDay: boolean;
  location?: string;
  accountEmail?: string;
}

interface TimedItem extends EventItem {
  s: number; // 当日0時からの開始分
  en: number; // 当日0時からの終了分
  col: number;
  cols: number;
}

const HOUR_PX = 44;

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function dayRangeISO(dateStr: string): { from: string; to: string } {
  const start = new Date(`${dateStr}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

function minutesFromMidnight(iso: string, dateStr: string): number {
  const base = new Date(`${dateStr}T00:00:00`).getTime();
  return Math.round((new Date(iso).getTime() - base) / 60000);
}

function hhmm(iso?: string): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso),
  );
}

/** 重なるイベントを列に振り分ける（クラスタごとに最大同時数で列分割） */
function layout(items: TimedItem[]): TimedItem[] {
  const out: TimedItem[] = [];
  let cluster: TimedItem[] = [];
  let clusterEnd = -1;

  const flush = () => {
    const laneEnds: number[] = [];
    for (const it of cluster) {
      let placed = false;
      for (let i = 0; i < laneEnds.length; i++) {
        if (it.s >= laneEnds[i]) {
          laneEnds[i] = it.en;
          it.col = i;
          placed = true;
          break;
        }
      }
      if (!placed) {
        it.col = laneEnds.length;
        laneEnds.push(it.en);
      }
    }
    for (const it of cluster) {
      it.cols = laneEnds.length;
      out.push(it);
    }
    cluster = [];
    clusterEnd = -1;
  };

  for (const it of items) {
    if (cluster.length && it.s >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.en);
  }
  if (cluster.length) flush();
  return out;
}

export default function DayTimeline({ reloadSignal = 0 }: { reloadSignal?: number }) {
  const [date, setDate] = useState<string>(todayStr());
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    setError(null);
    try {
      const { from, to } = dayRangeISO(d);
      const res = await fetch(`/api/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
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
    load(date);
  }, [load, date, reloadSignal]);

  const allDay = useMemo(() => events.filter((e) => e.allDay), [events]);

  const { laidOut, rangeStart, rangeEnd } = useMemo(() => {
    const timed: TimedItem[] = events
      .filter((e) => !e.allDay && e.start && e.end)
      .map((e) => {
        let s = Math.max(0, Math.min(1440, minutesFromMidnight(e.start!, date)));
        let en = Math.max(0, Math.min(1440, minutesFromMidnight(e.end!, date)));
        if (en <= s) en = Math.min(1440, s + 30);
        return { ...e, s, en, col: 0, cols: 1 };
      })
      .sort((a, b) => a.s - b.s || a.en - b.en);

    let start = 8 * 60;
    let end = 21 * 60;
    if (timed.length) {
      start = Math.min(start, Math.floor(timed[0].s / 60) * 60);
      end = Math.max(end, Math.ceil(Math.max(...timed.map((i) => i.en)) / 60) * 60);
    }
    start = Math.max(0, start);
    end = Math.min(1440, end);
    return { laidOut: layout(timed), rangeStart: start, rangeEnd: end };
  }, [events, date]);

  const totalHeight = ((rangeEnd - rangeStart) / 60) * HOUR_PX;
  const hours: number[] = [];
  for (let h = rangeStart / 60; h <= rangeEnd / 60; h++) hours.push(h);

  const isToday = date === todayStr();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 日付コントロール */}
      <div className="flex items-center justify-between gap-1 border-b border-[var(--border)] px-3 py-2">
        <button
          onClick={() => setDate((d) => shiftDate(d, -1))}
          className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs transition hover:bg-[var(--surface-2)]"
          aria-label="前日"
        >
          ◀
        </button>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-xs outline-none focus:border-[var(--accent)]"
        />
        <button
          onClick={() => setDate((d) => shiftDate(d, 1))}
          className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs transition hover:bg-[var(--surface-2)]"
          aria-label="翌日"
        >
          ▶
        </button>
        <button
          onClick={() => setDate(todayStr())}
          disabled={isToday}
          className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs transition hover:bg-[var(--surface-2)] disabled:opacity-40"
        >
          今日
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {loading && <p className="text-xs text-[var(--muted)]">読み込み中…</p>}
        {error && <p className="text-xs text-red-400">{error}</p>}

        {/* 終日予定 */}
        {!loading && allDay.length > 0 && (
          <div className="mb-2 space-y-1">
            {allDay.map((ev) => (
              <div
                key={ev.id}
                className="truncate rounded-md px-2 py-1 text-[11px] text-white"
                style={{ background: badgeColor(ev.accountEmail) }}
                title={ev.summary}
              >
                終日 ・ {ev.summary}
              </div>
            ))}
          </div>
        )}

        {!loading && !error && (
          <div className="flex">
            {/* 時刻ラベル */}
            <div className="relative w-9 shrink-0" style={{ height: totalHeight }}>
              {hours.map((h) => (
                <div
                  key={h}
                  className="absolute right-1 text-[10px] text-[var(--muted)]"
                  style={{ top: ((h * 60 - rangeStart) / 60) * HOUR_PX - 6 }}
                >
                  {h}:00
                </div>
              ))}
            </div>
            {/* タイムライン本体 */}
            <div className="relative flex-1" style={{ height: totalHeight }}>
              {hours.map((h) => (
                <div
                  key={h}
                  className="absolute inset-x-0 border-t border-[var(--border)]"
                  style={{ top: ((h * 60 - rangeStart) / 60) * HOUR_PX }}
                />
              ))}
              {laidOut.length === 0 && (
                <p className="absolute inset-x-0 top-2 text-center text-xs text-[var(--muted)]">
                  予定はありません
                </p>
              )}
              {laidOut.map((it) => {
                const top = ((it.s - rangeStart) / 60) * HOUR_PX;
                const height = Math.max(18, ((it.en - it.s) / 60) * HOUR_PX - 2);
                return (
                  <div
                    key={it.id}
                    className="absolute overflow-hidden rounded-md px-1.5 py-0.5 text-[11px] leading-tight text-white"
                    style={{
                      top,
                      height,
                      left: `${(it.col / it.cols) * 100}%`,
                      width: `calc(${100 / it.cols}% - 3px)`,
                      background: badgeColor(it.accountEmail),
                    }}
                    title={`${hhmm(it.start)}–${hhmm(it.end)} ${it.summary}${
                      it.location ? ` @${it.location}` : ""
                    }`}
                  >
                    <div className="truncate font-medium">{it.summary}</div>
                    <div className="truncate opacity-80">
                      {hhmm(it.start)}–{hhmm(it.end)}
                      {it.location ? ` ・${it.location}` : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
