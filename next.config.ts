import type { NextConfig } from "next";

// Cache Components is off: every screen shows live data from MongoDB and
// refreshes after each dictated command, so there is nothing worth caching.
const nextConfig: NextConfig = {
  // The PDF fonts are read from disk at run time, so ship them with the routes that draw PDFs.
  outputFileTracingIncludes: {
    "/api/quotations/*/pdf": ["./lib/pdf/fonts/**/*"],
    "/q/*": ["./lib/pdf/fonts/**/*"],
  },
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
