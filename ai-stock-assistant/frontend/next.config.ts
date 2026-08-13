import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained standalone server for the Docker runner stage
  // (see frontend/Dockerfile). Local `next dev` / `next start` are unaffected.
  output: "standalone",
};

export default nextConfig;
