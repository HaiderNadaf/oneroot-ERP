import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
    // Next.js upgrade agent: security fixes only
    agentUpgrade: "security",
    // ERP pages fetch their data in the browser after sign-in, so only validate segments
    // that explicitly opt in with `export const instant` (stops dev-overlay errors on every page)
    instantInsights: {
      validationLevel: "manual-warning",
    },
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
