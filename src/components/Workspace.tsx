"use client";

import { useCallback, useState } from "react";
import Chat from "./Chat";
import RightPanel from "./RightPanel";

type Provider = "claude" | "openai" | "gemini";

/** Chat と RightPanel を束ね、予定変更時にアジェンダを再読込する。
 *  モバイルでは下部タブで「チャット/予定」を全画面切替、md以上では横並び。 */
export default function Workspace({
  defaultProvider,
}: {
  defaultProvider: Provider;
}) {
  const [reloadSignal, setReloadSignal] = useState(0);
  const [mobileView, setMobileView] = useState<"chat" | "panel">("chat");
  const onCalendarChanged = useCallback(() => {
    setReloadSignal((n) => n + 1);
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[1fr_320px]">
        <div
          className={
            "min-h-0 flex-col md:flex " +
            (mobileView === "chat" ? "flex" : "hidden")
          }
        >
          <Chat defaultProvider={defaultProvider} onCalendarChanged={onCalendarChanged} />
        </div>
        <div
          className={
            "min-h-0 flex-col md:flex " +
            (mobileView === "panel" ? "flex" : "hidden")
          }
        >
          <RightPanel reloadSignal={reloadSignal} />
        </div>
      </div>

      {/* モバイル用の下部タブ */}
      <div className="flex gap-2 md:hidden">
        {(
          [
            ["chat", "チャット"],
            ["panel", "予定"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setMobileView(key)}
            className={
              "flex-1 rounded-xl border py-2 text-sm font-medium transition " +
              (mobileView === key
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
