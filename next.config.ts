import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project (multiple lockfiles exist on the
  // machine, which otherwise makes Turbopack infer the wrong root).
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
