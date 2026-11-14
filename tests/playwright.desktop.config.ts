import path from "node:path";
import { defineConfig } from "@playwright/test";

// Playwright empties outputDir when a run starts. Parallel agents each boot a
// private app copy (MASARFLOW_E2E_APP_DIR); give each its own results folder
// next to that copy, or one agent's run deletes another's traces mid-test.
const privateApp = process.env.MASARFLOW_E2E_APP_DIR?.trim();
const outputDir = privateApp ? path.join(path.dirname(privateApp), "test-results") : "../test-results/desktop";

/**
 * Desktop e2e: runs against the PACKAGED app (desktop/dist/win-unpacked).
 *
 * MasarFlow is desktop-only, so this is the only Playwright config:
 * - no webServer: the app starts its own Next server inside Electron;
 * - one worker: each spec owns a real app process and a real profile dir.
 *
 * Build first: `pnpm desktop:dist:dir`.
 */
export default defineConfig({
  testDir: "./e2e/desktop",
  outputDir,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: { trace: "retain-on-failure", video: "off" },
});
