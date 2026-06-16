import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // libSQL のネイティブ/オプショナル依存をサーバ外部パッケージ扱いにする
  serverExternalPackages: ["@libsql/client", "libsql"],
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
