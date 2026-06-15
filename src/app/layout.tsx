import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TaskAI — チャットで予定管理",
  description: "Claude とチャットして Google カレンダーに予定を追加・編集できるツール",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
