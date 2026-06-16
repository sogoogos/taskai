"use client";

import { useCallback, useState } from "react";
import Chat from "./Chat";
import RightPanel from "./RightPanel";
import Tasks from "./Tasks";
import Trading from "./Trading";

type Provider = "claude" | "openai" | "gemini";
type Active = "chat" | "schedule" | "tasks" | "trading";
type RightView = "schedule" | "tasks" | "trading";

const RIGHT_TABS: [RightView, string][] = [
  ["schedule", "予定"],
  ["tasks", "タスク"],
  ["trading", "投資"],
];

/** チャット / 予定 / タスク / 投資 の4セクションを束ねる。
 *  - デスクトップ: 左=チャット常時、右=「予定｜タスク｜投資」を上部トグルで切替
 *  - モバイル: 下部タブで「チャット / 予定 / タスク / 投資」を全画面切替
 *  右側の各パネルは両方マウントしたまま保持し、切替で再 fetch しない。 */
export default function Workspace({
  defaultProvider,
}: {
  defaultProvider: Provider;
}) {
  const [reloadSignal, setReloadSignal] = useState(0);
  const [active, setActive] = useState<Active>("chat");
  const onCalendarChanged = useCallback(() => {
    setReloadSignal((n) => n + 1);
  }, []);

  // チャット表示中（モバイル）でも、デスクトップ右カラムは何か表示する必要があるので既定は予定。
  const rightView: RightView = active === "chat" ? "schedule" : active;
  const pane = (key: RightView) =>
    "min-h-0 flex-1 flex-col " + (rightView === key ? "flex" : "hidden");
  // タスク/投資は単体だとカード枠が無いので付与（予定パネルは自前で枠を持つ）
  const card = "rounded-2xl border border-[var(--border)] bg-[var(--surface)]";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[1fr_320px]">
        {/* チャット: モバイルは active==chat のときのみ全画面。デスクトップは常時左に表示。 */}
        <div
          className={
            "min-h-0 flex-col md:flex " + (active === "chat" ? "flex" : "hidden")
          }
        >
          <Chat defaultProvider={defaultProvider} onCalendarChanged={onCalendarChanged} />
        </div>

        {/* 右カラム: モバイルは active!=chat のとき全画面。デスクトップは常時表示。 */}
        <div
          className={
            "min-h-0 flex-col md:flex " + (active !== "chat" ? "flex" : "hidden")
          }
        >
          {/* デスクトップ用「予定｜タスク｜投資」トグル（モバイルは下部タブを使うので隠す） */}
          <div className="mb-2 hidden gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 md:flex">
            {RIGHT_TABS.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setActive(key)}
                className={
                  "flex-1 rounded-lg py-1.5 text-xs font-medium transition " +
                  (rightView === key
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--muted)] hover:bg-[var(--surface-2)]")
                }
              >
                {label}
              </button>
            ))}
          </div>

          {/* 予定・タスク・投資パネルを全てマウントし、非アクティブは CSS で隠す（再 fetch 防止） */}
          <div className={pane("schedule")}>
            <RightPanel reloadSignal={reloadSignal} onCalendarChanged={onCalendarChanged} />
          </div>
          <div className={pane("tasks") + " " + card}>
            <Tasks reloadSignal={reloadSignal} onTasksChanged={onCalendarChanged} />
          </div>
          <div className={pane("trading") + " " + card}>
            <Trading reloadSignal={reloadSignal} />
          </div>
        </div>
      </div>

      {/* モバイル用の下部タブ */}
      <div className="flex gap-1.5 md:hidden">
        {(
          [
            ["chat", "チャット"],
            ["schedule", "予定"],
            ["tasks", "タスク"],
            ["trading", "投資"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActive(key)}
            className={
              "flex-1 rounded-xl border py-2 text-sm font-medium transition " +
              (active === key
                ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]")
            }
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
