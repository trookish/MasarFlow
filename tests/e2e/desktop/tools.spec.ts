/**
 * P9.T18 — matrix sweep for the Tools routes on the PACKAGED app:
 *   /tools/terminal  (3 titles)
 *   /tools/logs      (1 title)
 *   /tools/system    (1 title)
 *
 * Every title is the exact string in tests/e2e/feature-matrix.json; the unit
 * guard (tests/unit/e2e/feature-matrix.test.ts) fails if a title has no spec.
 *
 * One app for the whole file (worker-scoped fixture): each test drives a
 * different route, the app is the real packaged binary, and the terminal
 * sessions between tests are cheap to keep. State that a test needs (a linked
 * folder) is created through the real UI with the native folder picker stubbed
 * — the IPC handler still runs, so roots.json is written by the app itself.
 */
import { appendFileSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test as base } from "@playwright/test";
import {
  expect,
  launchApp,
  linkFolder,
  navigateTo,
  userDataDir,
  waitForShellReady,
  type AppHandle,
} from "./_harness";

// The system panel must never show a secret; this value is planted in the
// app's environment (inherited from this process) and asserted absent.
const FAKE_SECRET = "msf_e2e_supersecret_value";
process.env.MASARFLOW_E2E_TOKEN = FAKE_SECRET;

// One linked folder for the whole file: the terminal, logs and system panels
// all read the same project's linked roots, and linking is the expensive part.
const FOLDER = mkdtempSync(path.join(os.tmpdir(), "msf-tools-"));

const test = base.extend<object, { desktop: AppHandle }>({
  desktop: [
    async ({}, provide) => {
      const handle = await launchApp({ seed: "demo" });
      await provide(handle);
      await handle.close();
    },
    { scope: "worker" },
  ],
});

const TERMINAL_RUN_TITLE =
  "/tools/terminal: TERMINAL starts a shell in a linked folder, runs a command and re-attaches after a reload";
const TERMINAL_REFUSE_TITLE =
  "/tools/terminal: TERMINAL refuses a folder that is not registered and says why";
const TERMINAL_KILL_TITLE =
  "/tools/terminal: TERMINAL kills a runaway process and reports the exit";
const LOGS_TITLE = "/tools/logs: LOGS lists log files, tails one and filters to errors only";
const SYSTEM_TITLE =
  "/tools/system: SYSTEM reports version, allowed folders and table counts read-only";

const SURFACE = '[aria-label="Terminal output"]';

interface SessionInfo {
  id: string;
  label: string;
  cwd: string;
  status: "running" | "exited";
  exitCode: number | null;
}

interface StartVerdict {
  ok: boolean;
  error?: string;
  session?: SessionInfo;
}

/** The app's own preload bridge (window.masarflow) — the same IPC the panel uses. */
async function sessions(handle: AppHandle): Promise<SessionInfo[]> {
  return handle.page.evaluate(async () => {
    const api = (window as unknown as {
      masarflow?: { terminal: { list(): Promise<SessionInfo[]> } };
    }).masarflow;
    return api ? api.terminal.list() : [];
  });
}

async function startSession(page: import("@playwright/test").Page, folder: string): Promise<void> {
  await navigateTo(page, "Terminal");
  const row = page.locator("li", { hasText: folder });
  await row.getByRole("button", { name: "Start" }).click();
  await expect(page.locator(SURFACE)).toBeVisible({ timeout: 20_000 });
}

test(TERMINAL_RUN_TITLE, async ({ desktop }) => {
  const { page } = desktop;
  const folder = FOLDER;
  await linkFolder(page, desktop, folder);

  await startSession(page, folder);
  await expect(page.getByText("No session yet.")).toHaveCount(0);

  // Type into the real shell (cmd.exe) and read the real output.
  await page.locator(SURFACE).click();
  await page.keyboard.type("echo MSF_E2E_TERM_OK");
  await page.keyboard.press("Enter");
  await expect(page.locator(SURFACE)).toContainText("MSF_E2E_TERM_OK", { timeout: 30_000 });

  const live = await sessions(desktop);
  expect(live).toHaveLength(1);
  expect(live[0].cwd.replace(/\//g, "\\").toLowerCase()).toBe(folder.replace(/\//g, "\\").toLowerCase());
  expect(live[0].status).toBe("running");

  // Panel switches must not lose the session or its scrollback.
  await navigateTo(page, "Dashboard");
  await expect(page.locator('[data-testid="dock-panel"][data-dock-url="/dashboard"]')).toBeVisible();
  await navigateTo(page, "Terminal");
  await expect(page.locator(SURFACE)).toContainText("MSF_E2E_TERM_OK", { timeout: 20_000 });
  expect(await sessions(desktop)).toHaveLength(1);

  // A full page reload: the shell lives in the main process, so the panel must
  // re-attach to the same session and replay its buffer instead of showing a
  // fresh, empty terminal (or pretending the session is gone).
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForShellReady(page);
  await navigateTo(page, "Terminal");
  await expect(page.locator(SURFACE)).toContainText("MSF_E2E_TERM_OK", { timeout: 30_000 });
  const afterReload = await sessions(desktop);
  expect(afterReload).toHaveLength(1);
  expect(afterReload[0].status).toBe("running");
  await expect(page.getByRole("button", { name: /\(exited\)/ })).toHaveCount(0);

  // The fixture is worker-scoped, so end this shell through the panel's own
  // control: the kill test below starts from an empty session list.
  await page.getByRole("button", { name: "End this session" }).click();
  await expect.poll(async () => (await sessions(desktop)).length, { timeout: 20_000 }).toBe(0);
  await expect(page.getByText("No session yet.")).toBeVisible();
});

test(TERMINAL_REFUSE_TITLE, async ({ desktop }) => {
  const { page } = desktop;
  const folder = FOLDER;
  await linkFolder(page, desktop, folder);
  await navigateTo(page, "Terminal");

  // The registered folder is offered, and marked allowed.
  const row = page.locator("li", { hasText: folder });
  await expect(row.getByRole("button", { name: "Start" })).toBeEnabled({ timeout: 20_000 });

  // A folder that was never picked in the native dialog: the renderer may ask,
  // the main process refuses (roots.json is re-read on every start).
  const unregistered = mkdtempSync(path.join(os.tmpdir(), "msf-unregistered-"));
  const before = (await sessions(desktop)).length;
  const verdict: StartVerdict = await page.evaluate(async (dir) => {
    const api = (window as unknown as {
      masarflow: { terminal: { start(input: unknown): Promise<StartVerdict> } };
    }).masarflow;
    return api.terminal.start({ cwd: dir, cols: 100, rows: 30 });
  }, unregistered);

  expect(verdict.ok).toBe(false);
  expect(verdict.error).toContain("is not inside a registered folder");
  expect(verdict.error).toContain("Linked folders");
  expect(await sessions(desktop)).toHaveLength(before); // nothing was started
});

test(TERMINAL_KILL_TITLE, async ({ desktop }) => {
  const { page } = desktop;
  const folder = FOLDER;
  await linkFolder(page, desktop, folder);
  await startSession(page, folder);

  // A command that would run for ten minutes: the runaway case.
  await page.locator(SURFACE).click();
  await page.keyboard.type("ping -n 600 127.0.0.1");
  await page.keyboard.press("Enter");
  await expect
    .poll(async () => (await sessions(desktop)).length, { timeout: 30_000 })
    .toBe(1);
  expect((await sessions(desktop))[0].status).toBe("running");

  // Kill it: the session must disappear from the panel AND the main process.
  await page.getByRole("button", { name: "End this session" }).click();
  await expect(page.getByText("No session yet.")).toBeVisible({ timeout: 20_000 });
  await expect.poll(async () => (await sessions(desktop)).length, { timeout: 20_000 }).toBe(0);

  // The exit code is reported back into the terminal.
  await startSession(page, folder);
  await page.locator(SURFACE).click();
  await page.keyboard.type("exit 3");
  await page.keyboard.press("Enter");
  await expect(page.locator(SURFACE)).toContainText("Process exited with code 3.", {
    timeout: 30_000,
  });
  await expect(page.getByRole("button", { name: /\(exited\)/ })).toBeVisible();
});

test(LOGS_TITLE, async ({ desktop }) => {
  const { page } = desktop;
  await navigateTo(page, "Logs");

  const picker = page.locator('select[aria-label="Log file"]');
  await expect(picker).toBeVisible({ timeout: 20_000 });
  await expect(picker.locator("option", { hasText: "server.log" })).toHaveCount(1);

  // Two lines with known levels, written to the file the app itself reads.
  const sentinelOk = `MSF-E2E info sentinel ${Date.now()}`;
  const sentinelError = `MSF-E2E sentinel failed to parse ${Date.now()}`;
  appendFileSync(
    path.join(userDataDir(desktop), "logs", "server.log"),
    `\n${sentinelOk}\n${sentinelError}\n`,
  );

  await picker.selectOption("server.log");
  // Scope to the Logs panel: other dock panels (e.g. the terminal's "Refresh
  // sessions") also expose a button whose name contains "Refresh".
  await page
    .locator('[data-testid="dock-panel"][data-dock-url="/tools/logs"]')
    .getByRole("button", { name: "Refresh" })
    .click();
  await expect(page.getByText(sentinelOk)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(sentinelError)).toBeVisible();

  // "Errors only" keeps the error line and drops the info line.
  const filterGroup = page.getByRole("group", { name: "Filter log lines" });
  await filterGroup.getByRole("button", { name: "Errors only" }).click();
  await expect(page.getByText(sentinelError)).toBeVisible();
  await expect(page.getByText(sentinelOk)).toHaveCount(0);
  await expect(page.getByText(/\d+ of \d+ lines/)).toBeVisible();

  await filterGroup.getByRole("button", { name: "Everything" }).click();
  await expect(page.getByText(sentinelOk)).toBeVisible();
});

test(SYSTEM_TITLE, async ({ desktop }) => {
  const { page } = desktop;
  const folder = FOLDER;
  await linkFolder(page, desktop, folder);
  await navigateTo(page, "System Info");

  const runtime = page.getByRole("region", { name: "Runtime" });
  await expect(runtime).toBeVisible({ timeout: 20_000 });
  await expect(runtime).toContainText("0.2.0.0");
  await expect(runtime).toContainText("Packaged desktop app");
  await expect(runtime).toContainText(userDataDir(desktop));

  const env = page.getByRole("region", { name: "Environment" });
  await expect(env).toContainText("MASARFLOW_E2E");
  await expect(env).toContainText("MASARFLOW_E2E_TOKEN");
  await expect(env).toContainText("[REDACTED]");
  // The secret value never reaches the renderer at all.
  await expect(env).not.toContainText(FAKE_SECRET);
  await expect(page.getByText(FAKE_SECRET)).toHaveCount(0);

  const folders = page.getByRole("region", { name: "Allowed folders" });
  await expect(folders).toContainText(folder);
  await expect(folders).toContainText(/allowed: the agent and the terminal may read and run here/);

  const localData = page.getByRole("region", { name: "Local data" });
  await expect(localData).toContainText("notes");
  await expect(localData).toContainText("tasks");
  await expect(localData).toContainText(/\d/);

  // Read-only: nothing on this route accepts input.
  const panel = page.locator('[data-testid="dock-panel"][data-dock-url="/tools/system"]');
  await expect(panel.locator("input, textarea, select, [contenteditable='true']")).toHaveCount(0);
});
