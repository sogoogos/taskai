import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 はネイティブモジュールなのでサーバ外部パッケージ扱いにする
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
