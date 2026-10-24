import type { NextConfig } from "next";

// Cache Components is off: every screen shows live data from MongoDB and
// refreshes after each dictated command, so there is nothing worth caching.
const nextConfig: NextConfig = {
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
