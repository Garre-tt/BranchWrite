import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.BRANCHWRITE_NEXT_DIST_DIR ?? ".next",
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
