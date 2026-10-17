import { test as base, expect, _electron as electron } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Packaged-app e2e harness (P9.T6).
 *
 * Every launch boots the REAL binary from desktop/dist/win-unpacked with a
 * throwaway `--user-data-dir`, so:
 * - the user's own %APPDATA%\MasarFlow is never touched (profile, IndexedDB,
 *   localStorage and the embedded server's data dir are all inside the temp
 *   dir — the isolation mechanism scripts/smoke-desktop.mjs already uses);
 * - two specs can never share state;
 * - MASARFLOW_SMOKE is never set (it makes the app exit by design).
 *
 * The suite addresses the shell through the P9.T6 anchor contract
 * (guarded by tests/unit/repo-truth/anchor-contract.test.ts):
 *   [data-testid="app-shell"]   the workspace root div
 *   [data-testid="shell-ready"] dock workspace root — only while a project is active
 *   [data-testid="dock-panel"]  the focused panel's container, with [data-dock-url]
 *   [data-dock-tab][data-dock-url="<panel id>"]  the tab that focuses a panel
 */

export const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/**
 * The packaged binary. productName is read from desktop/electron-builder.yml;
 * if that changes, this resolves it from the config instead of failing with a
 * confusing ENOENT.
 */
export function packagedExe(): string {
  const dir = path.join(REPO_ROOT, "desktop", "dist", "win-unpacked");
  const cfg = path.join(REPO_ROOT, "desktop", "electron-builder.yml");
  if (existsSync(cfg)) {
    const m = /^productName:\s*(.+)$/m.exec(readFileSync(cfg, "utf8"));
    const candidate = m ? path.join(dir, `${m[1].trim()}.exe`) : null;
    if (candidate && existsSync(candidate)) return candidate;
  }
  if (existsSync(dir)) {
    const exe = readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith(".exe"))
      .filter((f) => !/unins|elevate|crashpad/i.test(f))[0];
    if (exe) return path.join(dir, exe);
  }
  throw new Error(
    `No packaged app found in ${dir}. Run: pnpm desktop:dist:dir (≈90 s). ` +
      `The e2e suite never runs against the dev server — that is the point of P9.`,
  );
}

export interface AppHandle {
  app: ElectronApplication;
  page: Page;
  /** Profile dir for this run (kept on disk so a failure can be re-opened). */
  profileDir: string;
  close(): Promise<void>;
}

export interface LaunchOptions {
  /**
   * "none"    — pristine profile: no project, the first-run UI still owns the
   *             screen (the first-run spec drives it with createFirstProject).
   * "demo"    — onboarding completed with one project, then the demo seed
   *             (Pulse/Lumen/DraftDeck) loaded; shell ready. The default
   *             `desktop` fixture uses this.
   * "project" — onboarding completed with one project, shell ready. For specs
   *             that need an interactive shell but no seeded data (cold-start
   *             measurements, restart loops).
   */
  seed?: "none" | "demo" | "project";
}

/**
 * Boots the packaged app with a throwaway profile.
 */
export async function launchApp(opts: LaunchOptions = {}): Promise<AppHandle> {
  const profileDir = mkdtempSync(path.join(os.tmpdir(), "masarflow-e2e-"));
  const app = await electron.launch({
    executablePath: packagedExe(),
    args: [`--user-data-dir=${path.join(profileDir, "profile")}`],
    env: { ...(process.env as Record<string, string>), MASARFLOW_E2E: "1" },
  });
  const page = await app.firstWindow();
  await page.waitForSelector('[data-testid="app-shell"]', { timeout: 120_000 });
  // P3 removed the Python boot gate (src/components/shell/python-required-screen.tsx);
  // its heading must never appear in the shipped app.
  await expect(page.getByRole("heading", { name: /Python/i })).toHaveCount(0);
  if (opts.seed === "demo") await seedDemoProjects(page);
  else if (opts.seed === "project") {
    await createFirstProject(page, "E2E Project");
    await waitForShellReady(page);
  }
  return {
    app,
    page,
    profileDir,
    async close() {
      await app.close().catch(() => {});
    },
  };
}

/** Waits until a project is active and the workspace is interactive. */
export async function waitForShellReady(page: Page): Promise<void> {
  await page.waitForSelector('[data-testid="shell-ready"]', { timeout: 120_000 });
}

/**
 * Completes the P10 setup wizard on a fresh profile: welcome → project
 * (creates `projectName`) → skip folder/provider/migrate → finish. The wizard
 * is what a never-configured install shows first, so every spec that is not
 * ABOUT the first run goes through this.
 */
export async function completeOnboarding(page: Page, projectName: string): Promise<void> {
  const wizard = page.getByRole("dialog", { name: "Set up MasarFlow" });
  await expect(wizard).toBeVisible({ timeout: 60_000 });

  await wizard.getByRole("button", { name: /^Continue$/ }).click(); // welcome → project
  // The project step blocks until a project exists.
  await wizard.getByRole("button", { name: /Create a project/ }).click();
  const projectDialog = page
    .getByRole("dialog")
    .filter({ has: page.getByPlaceholder("Project name") });
  await projectDialog.getByPlaceholder("Project name").fill(projectName);
  await projectDialog.getByRole("button", { name: "Create project" }).click();
  await expect(wizard.getByText("Project ready.")).toBeVisible({ timeout: 30_000 });

  await wizard.getByRole("button", { name: /^Continue$/ }).click(); // project → folder
  for (let i = 0; i < 3; i++) {
    // folder → provider → migrate → finish; each of the three is skippable.
    await wizard.getByRole("button", { name: /^Skip$/ }).click();
  }
  await wizard.getByRole("button", { name: /Start using MasarFlow|Close/ }).click();
  await expect(wizard).toHaveCount(0, { timeout: 30_000 });
}

/**
 * First-run path: an empty profile shows the setup wizard (packaged default)
 * or, when setup already completed but no project exists, the blocking
 * project dialog. Either way this ends with `projectName` active and the
 * shell interactive.
 */
export async function createFirstProject(page: Page, name: string): Promise<void> {
  const wizard = page.getByRole("dialog", { name: "Set up MasarFlow" });
  const bare = page.getByPlaceholder("Project name");
  await expect(async () => {
    if ((await wizard.count()) > 0 || (await bare.count()) > 0) return;
    throw new Error("neither the setup wizard nor the first-run dialog is up yet");
  }).toPass({ timeout: 60_000 });

  if ((await wizard.count()) > 0) {
    await completeOnboarding(page, name);
  } else {
    const dialog = page.getByRole("dialog");
    await dialog.getByPlaceholder("Project name").fill(name);
    await dialog.getByRole("button", { name: "Create project" }).click();
  }
  await waitForShellReady(page);
}

/**
 * Navigates the shell to a nav destination by its label ("Settings",
 * "Plugins", "Brain", …), in either shell layout:
 * - left/right rail: the group panel holds the links;
 * - bottom floating dock (the packaged default, taskbarDirection "bottom"):
 *   links live in per-group popups — click the group button, then the link.
 * Specs must not assume one layout: the plan's `getByRole("link")` locators
 * only work in rail mode, which the packaged app does not default to.
 */
export async function navigateTo(page: Page, linkName: string): Promise<void> {
  const direct = page.getByRole("link", { name: linkName, exact: true });
  if ((await direct.count()) > 0) {
    await direct.first().click();
    return;
  }
  const groupButtons = page.locator(
    '[aria-label="Navigation dock"] nav button, nav[aria-label="Navigation groups"] button',
  );
  const labels = await groupButtons.evaluateAll((els) =>
    els
      .map((e) => e.getAttribute("aria-label"))
      .filter((l): l is string => Boolean(l) && l !== "Hide navigation dock"),
  );
  for (const label of labels) {
    await page.getByRole("button", { name: label, exact: true }).first().click();
    const link = page.getByRole("link", { name: linkName, exact: true });
    if ((await link.count()) > 0) {
      await link.first().click();
      return;
    }
  }
  throw new Error(`navigateTo: no link "${linkName}" in any navigation dock group`);
}

/**
 * Deterministic fixture: /settings → Data → "Load demo projects" seeds Pulse
 * (web app), Lumen (game) and DraftDeck (desktop) with notes, specs, tasks,
 * sprints, systems, docs, commits, canvases and chat threads, then activates
 * Pulse and routes to /dashboard (src/components/settings/settings-view.tsx).
 */
export async function seedDemoProjects(page: Page): Promise<void> {
  if ((await page.getByTestId("shell-ready").count()) === 0) {
    // Fresh install: the wizard still owns the screen.
    await createFirstProject(page, "E2E Project");
  }
  await navigateTo(page, "Settings");
  await page.getByRole("button", { name: "Data", exact: true }).first().click();
  await expect(page.getByText("Data Management").first()).toBeVisible();
  await page.getByRole("button", { name: /Load demo projects/i }).click();
  // loadDemo() activates Pulse when seeding finishes; the project switcher
  // showing it is the completion signal (the button flips to "Loading…" and
  // back too fast to observe reliably).
  await expect(page.getByText("Pulse").first()).toBeVisible({ timeout: 120_000 });
  await waitForShellReady(page);
}

/**
 * The embedded Next server's loopback port, read from the app's own server log
 * (userData/logs/server.log). Next prints `- Local: http://127.0.0.1:<port>`
 * once per boot and every boot appends, so the last match is this boot's port.
 * It is the one thing the restart spec must see CHANGE while `masarflow://app`
 * (the app-protocol origin) stays constant.
 */
export function backendPort(profileDir: string): number {
  const logPath = path.join(profileDir, "profile", "logs", "server.log");
  const text = readFileSync(logPath, "utf8");
  const ports = [...text.matchAll(/- Local:\s+http:\/\/127\.0\.0\.1:(\d+)/g)].map((m) =>
    Number(m[1]),
  );
  if (ports.length === 0) {
    throw new Error(
      `No "- Local: http://127.0.0.1:<port>" line in ${logPath} — cannot verify the loopback port.`,
    );
  }
  return ports[ports.length - 1];
}

/** Best-effort profile cleanup; a just-exited app can hold handles (EPERM). */
export function removeProfile(profileDir: string): void {
  try {
    rmSync(profileDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  } catch (error) {
    console.warn(
      "could not remove",
      profileDir,
      "-",
      (error as NodeJS.ErrnoException).code ?? String(error),
    );
  }
}

/** Writes JSON evidence into reports/p9/ and returns the path. */
export function writeEvidence(name: string, data: unknown): string {
  const dir = path.join(REPO_ROOT, "reports", "p9");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
  return file;
}

/**
 * Fixture: `await use(launchApp(...))` — one app per test file unless a spec
 * opts into more. Passing runs clean their profile dir; failed runs keep it
 * for inspection.
 */
export const test = base.extend<{ desktop: AppHandle }>({
  desktop: async ({}, use, testInfo) => {
    const handle = await launchApp({ seed: "demo" });
    await use(handle);
    await handle.close();
    if (testInfo.status === "passed") removeProfile(handle.profileDir);
  },
});
export { expect };
