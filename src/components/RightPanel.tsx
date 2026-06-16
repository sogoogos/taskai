"use client";

import { useState } from "react";
import Agenda from "./Agenda";
import DayTimeline from "./DayTimeline";
import WeekView from "./WeekView";
import Tasks from "./Tasks";

type Tab = "list" | "week" | "timeline" | "tasks";

/** 予定パネル: 「リスト」「週」「タイムライン」「タスク」をタブ切替。
 *  一度開いたタブはマウントしたまま保持し（非アクティブは CSS で非表示）、
 *  切り替えるたびに再 fetch しない（初回のみ取得＝キャッシュ）。 */
export default function RightPanel({
  reloadSignal,
  onCalendarChanged,
}: {
  reloadSignal: number;
  onCalendarChanged: () => void;
}) {
  const [tab, setTab] = useState<Tab>("list");
  // 訪問済みのタブだけマウントする（未訪問は不要な取得を避けて遅延マウント）
  const [visited, setVisited] = useState<Set<Tab>>(new Set<Tab>(["list"]));

  const select = (key: Tab) => {
    setTab(key);
    setVisited((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  };

  const tabBtn = (key: Tab, label: string) => (
    <button
      onClick={() => select(key)}
      className={
        "flex-1 whitespace-nowrap px-1.5 py-2 text-[11px] font-medium transition " +
        (tab === key
          ? "border-b-2 border-[var(--accent)] text-[var(--text)]"
          : "text-[var(--muted)] hover:text-[var(--text)]")
      }
    >
      {label}
    </button>
  );

  // 非アクティブは hidden（display:none）で保持。アクティブは flex で領域を満たす。
  const pane = (key: Tab) =>
    "min-h-0 flex-1 flex-col " + (tab === key ? "flex" : "hidden");

  return (
    <aside className="flex min-h-0 flex-1 flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex border-b border-[var(--border)]">
        {tabBtn("list", "リスト")}
        {tabBtn("week", "週")}
        {tabBtn("timeline", "タイムライン")}
        {tabBtn("tasks", "タスク")}
      </div>
      {visited.has("list") && (
        <div className={pane("list")}>
          <Agenda reloadSignal={reloadSignal} onCalendarChanged={onCalendarChanged} />
        </div>
      )}
      {visited.has("week") && (
        <div className={pane("week")}>
          <WeekView reloadSignal={reloadSignal} onCalendarChanged={onCalendarChanged} />
        </div>
      )}
      {visited.has("timeline") && (
        <div className={pane("timeline")}>
          <DayTimeline reloadSignal={reloadSignal} onCalendarChanged={onCalendarChanged} />
        </div>
      )}
      {visited.has("tasks") && (
        <div className={pane("tasks")}>
          <Tasks reloadSignal={reloadSignal} onTasksChanged={onCalendarChanged} />
        </div>
      )}
    </aside>
  );
}
