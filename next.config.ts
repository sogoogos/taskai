import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // libSQL のネイティブ/オプショナル依存をサーバ外部パッケージ扱いにする
  serverExternalPackages: ["@libsql/client", "libsql"],
};

export default nextConfig;
