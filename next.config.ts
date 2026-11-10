import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The share-card route reads these font files at runtime; make sure they ship with it.
  outputFileTracingIncludes: {
    "/api/card": ["./src/assets/fonts/**"],
  },
};

export default nextConfig;
