import { defineConfig } from "@playwright/test";

/**
 * Desktop e2e: runs against the PACKAGED app (desktop/dist/win-unpacked).
 *
 * Differences from tests/playwright.config.ts (the web project):
 * - no webServer: the app starts its own Next server inside Electron;
 * - testDir is the desktop subdirectory, so `pnpm e2e` (web) never picks these
 *   up and vice versa;
 * - one worker: each spec owns a real app process and a real profile dir.
 *
 * Build first: `pnpm desktop:dist:dir`.
 */
export default defineConfig({
  testDir: "./e2e/desktop",
  outputDir: "../test-results/desktop",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: { trace: "retain-on-failure", video: "off" },
});
