"use client";

import { useState } from "react";
import Agenda from "./Agenda";
import DayTimeline from "./DayTimeline";

type Tab = "list" | "timeline";

/** 右パネル: 「リスト（直近2週間）」と「タイムライン（日別の時間軸）」をタブ切替 */
export default function RightPanel({ reloadSignal }: { reloadSignal: number }) {
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
    <aside className="flex min-h-0 flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex border-b border-[var(--border)]">
        {tabBtn("list", "リスト")}
        {tabBtn("timeline", "タイムライン")}
      </div>
      {tab === "list" ? (
        <Agenda reloadSignal={reloadSignal} />
      ) : (
        <DayTimeline reloadSignal={reloadSignal} />
      )}
    </aside>
  );
}
