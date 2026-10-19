import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const monorepoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  agentRules: false,
  // Staging builds (scripts/build-staging.sh) export a static site per
  // direction; normal builds keep the default server output. Trailing slashes
  // make the export a plain folder/index.html tree any static host serves.
  output: process.env.NEXT_OUTPUT === "export" ? "export" : undefined,
  trailingSlash: process.env.NEXT_OUTPUT === "export" ? true : undefined,
  // A static export has no Image Optimizer, so next/image must emit plain
  // paths. Without this every editorial image 404s on the exported site.
  images: process.env.NEXT_OUTPUT === "export" ? { unoptimized: true } : undefined,
  turbopack: {
    root: monorepoRoot,
  },
};

export default nextConfig;
