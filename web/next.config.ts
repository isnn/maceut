import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `web`: the worker's headless export renderer reaches this dev server by its
  // docker-network name (FE-21). Without it the dev server refuses that origin's HMR
  // socket and the render page never hydrates. Dev-only; production has no such check.
  allowedDevOrigins: ["15.235.167.41", "web"],
};

export default nextConfig;
