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
 * Folders this spec process already linked, per app profile (see linkFolder).
 * A module-level memo, not a DB read: the app owns its IndexedDB.
 */
const linkedFoldersByProfile = new Map<string, Set<string>>();

/**
 * The packaged binary. productName is read from desktop/electron-builder.yml;
 * if that changes, this resolves it from the config instead of failing with a
 * confusing ENOENT.
 */
export function packagedExe(): string {
  // MASARFLOW_E2E_APP_DIR points at a private copy of win-unpacked, so a sibling's
  // `pnpm desktop:dist:dir` cannot replace the binary under a running suite.
  const dir = process.env.MASARFLOW_E2E_APP_DIR?.trim() || path.join(REPO_ROOT, "desktop", "dist", "win-unpacked");
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
  /**
   * Shell layout. Specs written for v0.2 drive the dock, so the harness opens them in the Studio
   * layout; "standard" leaves the 0.3 default (six surfaces) in place.
   */
  layout?: "studio" | "standard";
}

/** Persists the layout and reloads the renderer (the ui store reads it on start). */
async function applyLayout(page: Page, layout: "studio" | "standard"): Promise<void> {
  await page.evaluate((mode) => {
    const raw = localStorage.getItem("masarflow-ui");
    const parsed = raw ? (JSON.parse(raw) as { state?: Record<string, unknown>; version?: number }) : {};
    const state = { ...(parsed.state ?? {}), layoutMode: mode, layoutNoticeSeen: true };
    localStorage.setItem("masarflow-ui", JSON.stringify({ state, version: parsed.version ?? 1 }));
  }, layout);
  await page.reload();
  await page.waitForSelector('[data-testid="app-shell"]', { timeout: 120_000 });
  await page.waitForSelector(`[data-layout="${layout}"]`, { timeout: 60_000 });
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
  // Seeding drives the dock, so every launch starts in Studio and switches afterwards.
  await applyLayout(page, "studio");
  if (opts.seed === "demo") await seedDemoProjects(page);
  else if (opts.seed === "project") {
    await createFirstProject(page, "E2E Project");
    await waitForShellReady(page);
  }
  if (opts.layout === "standard") {
    await applyLayout(page, "standard");
    if (opts.seed && opts.seed !== "none") await waitForShellReady(page);
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
    // The popup renders after the click; counting immediately races it (it
    // passed on an idle machine and failed under load). Wait for this group's
    // menu to show before deciding the link is not in it.
    await page
      .locator('[aria-label="Navigation dock"] [role="menu"]')
      .filter({ hasText: label })
      .first()
      .waitFor({ state: "visible", timeout: 5_000 })
      .catch(() => undefined);
    const link = page.getByRole("link", { name: linkName, exact: true });
    if ((await link.count()) > 0) {
      await link.first().click();
      return;
    }
  }
  throw new Error(`navigateTo: no link "${linkName}" in any navigation dock group`);
}

/**
 * The demo fixture, end to end through product UI: /settings → Data → "Load
 * demo projects", then activate the Pulse demo project via the topbar switcher
 * and focus /dashboard.
 *
 * KNOWN BUG (packaged app only, found by this harness — see reports/p9/00-baseline.md):
 * `seedDemoProject()` throws `TransactionInactiveError` at Lumen's chat step
 * because `seedAiConnection()` awaits an Electron-IPC secret read
 * (`hydrateConnection` → `getSecret`) inside the open seed transaction. Pulse
 * and Lumen are still written, DraftDeck is not, and the seed never reaches
 * `setActiveProjectId(Pulse)` — so the fixture activates Pulse itself. When
 * the bug is fixed this becomes a no-op (the switcher already shows Pulse).
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
  await activateProject(page, DEMO_WEB_PROJECT);
  await navigateTo(page, "Dashboard");
  await waitForShellReady(page);
}

/** The web-app demo project the seed activates last (src/lib/db/demo-seed.ts). */
export const DEMO_WEB_PROJECT = "Pulse: Realtime Team Dashboard";

/**
 * Makes `name` the active project through the topbar switcher (the only
 * truthful signal — "Pulse" also appears in the /settings copy, so text
 * matching alone is a false positive). Retries while the seed is still
 * writing rows.
 */
export async function activateProject(page: Page, name: string): Promise<void> {
  const switcher = page.getByRole("banner").getByRole("button").first();
  await expect(async () => {
    if ((await switcher.innerText()).includes(name)) return; // already active
    await switcher.click();
    const row = page.getByRole("menu").getByRole("button", { name, exact: true });
    if ((await row.count()) === 0) {
      await page.keyboard.press("Escape");
      throw new Error(`project "${name}" is not in the switcher yet`);
    }
    await row.click();
    await expect(switcher).toContainText(name);
  }).toPass({ timeout: 60_000 });
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

/**
 * Makes the app's REAL "Choose folder" IPC answer with `folder` instead of
 * opening the native picker (P9.T18: the picker cannot be driven by a spec).
 *
 * Only `dialog.showOpenDialog` is stubbed — the IPC handler in
 * desktop/src/main/ipc/index.ts still runs end to end, so the picked folder is
 * recorded in the app's own roots.json exactly as a human pick would be, and
 * the renderer gets the same return value. No guard is bypassed.
 *
 * Pair with `restoreFolderPicker` when a test needs the picker to cancel
 * again (e.g. asserting "no folder picked" paths); otherwise the stub dies
 * with the app.
 */
export async function stubFolderPicker(handle: AppHandle, folder: string): Promise<void> {
  await handle.app.evaluate(async (electron, dir) => {
    const dialog = electron.dialog as unknown as {
      showOpenDialog: (...args: unknown[]) => Promise<{ canceled: boolean; filePaths: string[] }>;
    };
    const store = globalThis as unknown as Record<string, unknown>;
    if (!store.__msfE2EOriginalShowOpenDialog) {
      store.__msfE2EOriginalShowOpenDialog = dialog.showOpenDialog.bind(dialog);
    }
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] });
  }, folder);
}

/** Puts the real native folder picker back after `stubFolderPicker`. */
export async function restoreFolderPicker(handle: AppHandle): Promise<void> {
  await handle.app.evaluate(async (electron) => {
    const dialog = electron.dialog as unknown as { showOpenDialog: unknown };
    const store = globalThis as unknown as Record<string, unknown>;
    const original = store.__msfE2EOriginalShowOpenDialog;
    if (typeof original === "function") {
      dialog.showOpenDialog = original;
      delete store.__msfE2EOriginalShowOpenDialog;
    }
  });
}

/** userData dir of a running app (profile dir + /profile, see launchApp). */
export function userDataDir(handle: AppHandle): string {
  return path.join(handle.profileDir, "profile");
}

/**
 * Links `folder` to the active project through the real UI, and registers it
 * in the desktop app's roots.json (which the terminal, git and system panels
 * check before they touch a folder).
 *
 * The chat's "Linked folders" dialog only renders in agentic mode with a
 * thread, and a thread needs a configured AI provider — so this drives the git
 * panel's recovery flow instead, which mounts the SAME dialog:
 *   1. the panel's own picker selects the folder (the real IPC writes roots.json);
 *   2. roots.json is dropped and the panel refreshed, so git reports the state
 *      the dialog exists for ("Folder not linked" → Open Linked Projects);
 *   3. the dialog re-links it — Browse… (native picker stubbed) → Link folder —
 *      which writes the linkedProjects row the terminal/system panels list.
 *
 * Idempotent: returns early when the folder is already linked and allowed.
 */
export async function linkFolder(page: Page, handle: AppHandle, folder: string): Promise<void> {
  // Per-profile memo, not a DB read: touching the app's IndexedDB from the spec
  // disturbs its Dexie connection and remounts the dock (the git panel then
  // re-resolves its root mid-flow). The UI itself proves the link landed.
  const done = linkedFoldersByProfile.get(handle.profileDir) ?? new Set<string>();
  if (done.has(folder)) return;

  await stubFolderPicker(handle, folder);
  await navigateTo(page, "Git");
  const panel = page.locator('[data-testid="dock-panel"][data-dock-url="/git"]');
  await expect(panel).toBeVisible({ timeout: 30_000 });
  // The dock-panel div exists before the git view mounts; its header button is
  // the first thing GitView renders, so this is the "content is settled" wait
  // that `locator.count()` (which never waits) must not replace.
  await expect(panel.getByRole("button", { name: "Refresh" })).toBeVisible({ timeout: 30_000 });

  // The picker's IPC writes the allow-list synchronously; wait for the file.
  // roots.json stores JSON (Windows backslashes escaped), so compare parsed,
  // normalised paths — never a raw substring of the file.
  const rootsPath = path.join(userDataDir(handle), "roots.json");
  const allowedInFile = (): boolean => {
    try {
      const parsed = JSON.parse(readFileSync(rootsPath, "utf8")) as { roots?: string[] };
      return (parsed.roots ?? []).some(
        (r) => path.resolve(r).toLowerCase() === path.resolve(folder).toLowerCase(),
      );
    } catch {
      return false;
    }
  };

  const choose = panel.getByRole("button", { name: "Choose a folder…" });
  if ((await choose.count()) > 0) {
    await choose.click(); // pickRoot → real dialog:choose-folder IPC → roots.json
  } else if (!allowedInFile()) {
    // A root is already selected but the folder is no longer on the allow-list
    // (an earlier run dropped it): re-pick through the panel's own Folder
    // button — same IPC, same file.
    await panel.getByRole("button", { name: "Folder", exact: true }).click();
  }
  await expect(panel.getByText(folder).first()).toBeVisible({ timeout: 20_000 });
  await expect.poll(allowedInFile, { timeout: 10_000 }).toBe(true);
  // The state the recovery dialog exists for: the folder is no longer allowed.
  rmSync(rootsPath, { force: true });
  await expect(panel.getByRole("button", { name: "Refresh" })).toBeVisible();
  await panel.getByRole("button", { name: "Refresh" }).click();
  await panel.getByRole("button", { name: "Open Linked Projects" }).click({ timeout: 30_000 });

  const dialog = page.getByRole("dialog", { name: "Linked projects" });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  if ((await dialog.getByText(folder, { exact: true }).count()) === 0) {
    await dialog.getByRole("button", { name: "Browse…" }).click();
    await expect(dialog.getByPlaceholder(/Absolute folder path/)).toHaveValue(folder);
    await dialog.getByRole("button", { name: "Link folder" }).click();
    await expect(dialog.getByText(folder, { exact: true })).toBeVisible({ timeout: 15_000 });
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0, { timeout: 15_000 });
  done.add(folder);
  linkedFoldersByProfile.set(handle.profileDir, done);
}

/**
 * Reads a whole table from the app's own IndexedDB (the "masarflow" database,
 * src/lib/db/index.ts) inside the renderer. Used to assert what the app really
 * persisted, not what a toast claimed.
 */
export async function readTable<T = Record<string, unknown>>(page: Page, table: string): Promise<T[]> {
  return page.evaluate(async (name) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("masarflow");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    try {
      return await new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const tx = db.transaction(name, "readonly");
        const all = tx.objectStore(name).getAll();
        all.onsuccess = () => resolve(all.result as Record<string, unknown>[]);
        all.onerror = () => reject(all.error);
      });
    } finally {
      db.close();
    }
  }, table) as Promise<T[]>;
}

/**
 * Saves a provider connection labeled `label` (default "E2E stub") that points
 * at `baseUrl` — a loopback stub server from _stub-provider.ts — through the
 * real Connections dialog. The dialog is opened from the Agents page header
 * ("AI connections"), the one call site reachable without a chat thread
 * selected; the saved row is global (aiConnectionsRepo.list), so the chat
 * header sees it immediately via its live query.
 *
 * The provider is "Local (Ollama)": it is the catalog entry with `noAuth`,
 * so the connection needs no API key and /api/chat accepts it as-is.
 */
export async function addStubConnection(
  page: Page,
  baseUrl: string,
  label = "E2E stub",
): Promise<void> {
  await navigateTo(page, "AI Agents");
  await page.getByRole("button", { name: "AI connections" }).click();
  const dialog = page.getByRole("dialog", { name: "AI connections" });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  if ((await dialog.getByText(label, { exact: true }).count()) === 0) {
    await dialog.getByRole("button", { name: "Add", exact: true }).click();
    await dialog.getByRole("button", { name: /Select a provider/ }).click();
    await dialog.getByPlaceholder("Search providers…").fill("ollama");
    await dialog.getByRole("button", { name: /Local \(Ollama\)/ }).click();
    await dialog.getByTestId("connection-label").fill(label);
    await dialog.getByTestId("connection-base-url").fill(baseUrl);
    await dialog.getByTestId("connection-save").click();
    // Back on the list: the row now shows the label.
    await expect(dialog.getByText(label, { exact: true })).toBeVisible({ timeout: 15_000 });
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0, { timeout: 15_000 });
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
  const file = path.join(dir, name);
  // Nested names ("a11y/summary.json") need their own directory first.
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
  return file;
}

/**
 * Fixture: `await provide(launchApp(...))` — one app per test file unless a
 * spec opts into more. Passing runs clean their profile dir; failed runs keep
 * it for inspection. (Playwright names this parameter `use`; it is renamed
 * here because `use(...)` in a non-component trips react-hooks/rules-of-hooks.)
 */
export const test = base.extend<{ desktop: AppHandle }>({
  desktop: async ({}, provide, testInfo) => {
    const handle = await launchApp({ seed: "demo" });
    await provide(handle);
    await handle.close();
    if (testInfo.status === "passed") removeProfile(handle.profileDir);
  },
});
export { expect };
