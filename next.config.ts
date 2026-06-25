import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // libSQL のネイティブ/オプショナル依存をサーバ外部パッケージ扱いにする
  serverExternalPackages: ["@libsql/client", "libsql"],
  // ビルド時のコミットSHAをクライアントへ埋め込む（更新検知に使う）。
  // Vercel では VERCEL_GIT_COMMIT_SHA が自動で入る。ローカルは "dev"。
  env: {
    NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA || "dev",
  },
  // ホーム画面アプリ(standalone)が古い版をキャッシュしないよう、
  // HTMLドキュメントは毎回再検証させる（JSチャンクはハッシュ付きなので不変キャッシュのまま）。
  async headers() {
    return [
      {
        source: "/",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
