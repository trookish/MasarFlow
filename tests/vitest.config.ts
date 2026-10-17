import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    globals: true,
  },
  resolve: {
    alias: {
      // `@shared` is the name the Electron code itself uses (see desktop/electron.vite.config.ts),
      // `@desktop-shared` is the name the Next app uses (root tsconfig). Same folder.
      "@desktop-shared": fileURLToPath(new URL("../desktop/src/shared", import.meta.url)),
      "@shared": fileURLToPath(new URL("../desktop/src/shared", import.meta.url)),
      "@desktop": fileURLToPath(new URL("../desktop/src/main", import.meta.url)),
      "@": fileURLToPath(new URL("../src", import.meta.url)),
    },
  },
});
