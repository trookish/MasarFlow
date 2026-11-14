import type { NextConfig } from "next";

const isStaticExport = process.env.EXPORT_STATIC === "true";

const nextConfig: NextConfig = {
  output: isStaticExport ? "export" : "standalone",
  distDir: isStaticExport ? "dist" : ".next",
  trailingSlash: isStaticExport ? true : false,
  reactStrictMode: true,
  images: {
    unoptimized: isStaticExport,
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "motion"],
  },
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self' https: ws: wss:; font-src 'self' data:;",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "origin-when-cross-origin",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
