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
    // Desktop shell (Electron main/preload) — own toolchain, checked by desktop:typecheck.
    "desktop/**",
    // Vendored ONNX runtime WASM/JS copied into public/ort by scripts/copy-ort.mjs
    // (generated, gitignored — never linted).
    "public/ort/**",
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
