"use client";

import { useState } from "react";
import Agenda from "./Agenda";
import DayTimeline from "./DayTimeline";
import Tasks from "./Tasks";
import Trading from "./Trading";

type Tab = "list" | "timeline" | "tasks" | "trading";

/** 右パネル: 「リスト」「タイムライン」「タスク」「投資」をタブ切替。
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
        "flex-1 px-3 py-2 text-xs font-medium transition " +
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
        {tabBtn("timeline", "タイムライン")}
        {tabBtn("tasks", "タスク")}
        {tabBtn("trading", "投資")}
      </div>
      {visited.has("list") && (
        <div className={pane("list")}>
          <Agenda reloadSignal={reloadSignal} onCalendarChanged={onCalendarChanged} />
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
      {visited.has("trading") && (
        <div className={pane("trading")}>
          <Trading reloadSignal={reloadSignal} />
        </div>
      )}
    </aside>
  );
}
