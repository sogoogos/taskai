"use client";

import { useCallback, useState } from "react";
import Chat from "./Chat";
import Agenda from "./Agenda";

type Provider = "claude" | "openai" | "gemini";

/** Chat と Agenda を束ね、予定変更時にアジェンダを再読込する */
export default function Workspace({
  defaultProvider,
}: {
  defaultProvider: Provider;
}) {
  const [reloadSignal, setReloadSignal] = useState(0);
  const onCalendarChanged = useCallback(() => {
    setReloadSignal((n) => n + 1);
  }, []);

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 md:grid-cols-[1fr_320px]">
      <Chat defaultProvider={defaultProvider} onCalendarChanged={onCalendarChanged} />
      <Agenda reloadSignal={reloadSignal} />
    </div>
  );
}
