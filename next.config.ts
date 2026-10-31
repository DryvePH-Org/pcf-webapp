import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // DECISION: Cache Components is off — on Cloudflare Workers its reliance
  // on setTimeout() made every request hang until the runtime killed it.
  // Nothing in this app uses "use cache", so this has no functional cost.
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

import('@opennextjs/cloudflare').then(m => m.initOpenNextCloudflareForDev());
