import type { MetadataRoute } from "next";

/** ホーム画面追加（PWA）用のマニフェスト。standalone 表示で起動する。 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TaskAI — チャットで予定管理",
    short_name: "TaskAI",
    description:
      "チャットで Google カレンダーの予定・タスク・投資状況を管理できるツール",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0d12",
    theme_color: "#0b0d12",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
