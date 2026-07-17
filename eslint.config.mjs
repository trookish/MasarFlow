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
  ]),
]);

export default eslintConfig;
