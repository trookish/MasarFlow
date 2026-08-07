import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config. Boots the production-like dev server and runs smoke tests
 * against the local-first app. Tests live in `tests/e2e/`.
 */
export default defineConfig({
  testDir: "./e2e",
  outputDir: "../test-results",
  // Generous timeouts: the dev server compiles routes on demand on first hit.
  timeout: 90_000,
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://localhost:3000",
    navigationTimeout: 60_000,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Run against the production build for fast, deterministic pages (no
    // dev-mode on-demand compilation). Run `npm run build` first.
    command: "npm run start",
    url: "http://localhost:3000",
    timeout: 120_000,
    reuseExistingServer: true,
  },
});
