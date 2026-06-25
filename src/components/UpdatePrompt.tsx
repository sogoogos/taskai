"use client";

import { useCallback, useEffect, useState } from "react";

// ビルド時に焼き込まれた、この画面が動いている版（next.config.ts で注入）
const BUILT = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";

/** 新しいデプロイを検知して「更新」バナーを出す軽量PWA更新通知。
 *  Service Worker は使わない（キャッシュ詰まりリスクなし）。
 *  - /api/version で「現在デプロイ中の版」を取得し、起動時の BUILT と照合
 *  - アプリ復帰時(visibilitychange)にも再チェック → 古ければバナー表示
 *  - タップで location.reload()（HTMLは no-store、JSはハッシュ付きなので最新を取得） */
export default function UpdatePrompt() {
  const [stale, setStale] = useState(false);

  const check = useCallback(async () => {
    // ローカル開発(dev)では更新検知しない（常に一致扱い）
    if (BUILT === "dev") return;
    try {
      const res = await fetch("/api/version", { cache: "no-store" });
      if (!res.ok) return;
      const { version } = (await res.json()) as { version?: string };
      if (version && version !== "dev" && version !== BUILT) setStale(true);
    } catch {
      // ネットワーク不通などは無視（次の機会に再チェック）
    }
  }, []);

  useEffect(() => {
    check();
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [check]);

  if (!stale) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <button
        onClick={() => window.location.reload()}
        className="flex w-full max-w-md items-center justify-between gap-3 rounded-2xl bg-[var(--accent)] px-5 py-4 text-left text-white shadow-xl transition hover:brightness-110 active:brightness-95"
      >
        <span className="flex flex-col">
          <span className="text-base font-semibold">新しいバージョンがあります</span>
          <span className="text-xs text-white/80">タップして最新の表示に更新</span>
        </span>
        <span className="shrink-0 rounded-xl bg-white/20 px-4 py-2 text-sm font-semibold">
          更新
        </span>
      </button>
    </div>
  );
}
