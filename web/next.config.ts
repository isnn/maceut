import type { NextConfig } from "next";

// Baseline headers on every page. No page is meant to be framed (clickjacking on
// login and sign-up), and browsers must not sniff a response into another type.
// HSTS is set at Cloudflare, the TLS edge.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  // `web`: the worker's headless export renderer reaches this dev server by its
  // docker-network name (FE-21). Without it the dev server refuses that origin's HMR
  // socket and the render page never hydrates. Dev-only; production has no such check.
  allowedDevOrigins: ["15.235.167.41", "web", "maceut.hokya.dev"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
