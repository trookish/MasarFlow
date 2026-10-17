import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project (multiple lockfiles exist on the
  // machine, which otherwise makes Turbopack infer the wrong root).
  turbopack: {
    root: import.meta.dirname,
  },
  output: "standalone",
  outputFileTracingRoot: import.meta.dirname,
  outputFileTracingExcludes: {
    // Keys are route globs; `/*` is the documented global key (spike S1).
    "/*": [
      "desktop/**",
      "python-service/**",
      ".hermes/**",
      "release/**",
      "tests/**",
      "test-results/**",
      ".opencode/**",
      ".masarflow/**",
    ],
  },
};

export default nextConfig;
