import type { NextConfig } from "next";
import "./src/config/env.ts";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Keep the repository's deliberately maintained root engineering rules canonical.
  agentRules: false,
};

export default nextConfig;
