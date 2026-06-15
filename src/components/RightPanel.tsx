"use client";

import { useState } from "react";
import Agenda from "./Agenda";
import DayTimeline from "./DayTimeline";
import Tasks from "./Tasks";

type Tab = "list" | "timeline" | "tasks";

/** 右パネル: 「リスト」「タイムライン」「タスク」をタブ切替 */
export default function RightPanel({
  reloadSignal,
  onCalendarChanged,
}: {
  reloadSignal: number;
  onCalendarChanged: () => void;
}) {
  const [tab, setTab] = useState<Tab>("list");

  const tabBtn = (key: Tab, label: string) => (
    <button
      onClick={() => setTab(key)}
      className={
        "flex-1 px-3 py-2 text-xs font-medium transition " +
        (tab === key
          ? "border-b-2 border-[var(--accent)] text-[var(--text)]"
          : "text-[var(--muted)] hover:text-[var(--text)]")
      }
    >
      {label}
    </button>
  );

  return (
    <aside className="flex min-h-0 flex-1 flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex border-b border-[var(--border)]">
        {tabBtn("list", "リスト")}
        {tabBtn("timeline", "タイムライン")}
        {tabBtn("tasks", "タスク")}
      </div>
      {tab === "list" && (
        <Agenda reloadSignal={reloadSignal} onCalendarChanged={onCalendarChanged} />
      )}
      {tab === "timeline" && (
        <DayTimeline reloadSignal={reloadSignal} onCalendarChanged={onCalendarChanged} />
      )}
      {tab === "tasks" && (
        <Tasks reloadSignal={reloadSignal} onTasksChanged={onCalendarChanged} />
      )}
    </aside>
  );
}
