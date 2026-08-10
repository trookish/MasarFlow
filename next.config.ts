import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project (multiple lockfiles exist on the
  // machine, which otherwise makes Turbopack infer the wrong root).
  turbopack: {
    root: import.meta.dirname,
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          '**/.vs/**',
          '**/.obsidian/**',
          '**/node_modules/**',
          // Runtime data + venv: the Python service writes Chroma files into
          // python-service/store on every embedding sync — recompiling on
          // those writes adds churn and can interrupt in-flight requests.
          '**/python-service/store/**',
          '**/python-service/.venv/**',
          '**/__pycache__/**',
        ],
      };
    }
    return config;
  },
};

export default nextConfig;
