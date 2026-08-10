import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Agent worktrees carry their own build artifacts — never lint them.
    ".claude/**",
    ".vs/**",
    // Python local AI service — not JS/TS, and its .venv bundles vendored
    // JS from ML packages (torch, sklearn) that ESLint should never touch.
    "python-service/**",
    // Desktop launcher — separate Vite app with its own toolchain.
    "desktop/**",
  ]),
  {
    // Local-first app: these components render blob:/data: URLs (IndexedDB
    // attachments) and arbitrary user-provided external URLs, where the
    // next/image optimizer cannot help. Plain <img> is correct here.
    files: [
      "src/components/brain/markdown-preview.tsx",
      "src/components/canvas/nodes/media-node.tsx",
      "src/components/canvas/nodes/web-node.tsx",
      "src/components/files/files-view.tsx",
    ],
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
]);

export default eslintConfig;
