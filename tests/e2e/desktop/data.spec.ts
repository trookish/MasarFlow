/**
 * Workspace data on the PACKAGED app: backup export and import, the database
 * health gate, the local semantic index and the code-highlighting setting.
 *
 * These were browser-mode specs before MasarFlow became desktop-only. Each one
 * now drives the shell a user clicks (surface sidebar, section tabs, Settings
 * sections) and reads what the app itself persisted.
 */
import { test as base, type Page } from "@playwright/test";
import {
  expect,
  activateProject,
  focusTab,
  launchApp,
  navigateTo,
  readTable,
  surfacePanel,
  type AppHandle,
} from "./_harness";

const test = base.extend<object, { desktop: AppHandle }>({
  desktop: [
    async ({}, provide) => {
      const handle = await launchApp({ seed: "project" });
      await provide(handle);
      await handle.close();
    },
    { scope: "worker" },
  ],
});

/** Opens Settings on one section (System surface → Settings → section button). */
async function openSettings(page: Page, section: string): Promise<void> {
  await navigateTo(page, "Settings");
  await page.getByRole("button", { name: section, exact: true }).first().click();
}

/** Creates a note through the Capture editor (autosave debounce is 450 ms). */
async function addNote(page: Page, title: string, body: string): Promise<void> {
  await navigateTo(page, "Brain");
  const notes = surfacePanel(page, "Notes");
  await notes.getByRole("button", { name: "New note" }).first().click();
  const titleInput = notes.getByPlaceholder("Untitled note");
  await expect(titleInput).toHaveValue("Untitled note", { timeout: 15_000 });
  await titleInput.fill(title);
  await notes.locator(".cm-content").first().click();
  await page.keyboard.insertText(body);
  await expect(notes.locator("button", { hasText: title }).first()).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(async () => (await readTable<{ title: string; body: string }>(page, "notes")).find((n) => n.title === title)?.body ?? "")
    .toContain(body.slice(0, 20));
}

test("/settings: code highlighting applies to note preview", async ({ desktop }) => {
  const { page } = desktop;
  await addNote(page, "Highlight note", "~~~ts\nconst x: number = 1;\n~~~");
  const notes = surfacePanel(page, "Notes");
  await notes.getByRole("tab", { name: "Read" }).click();
  await expect(notes.locator("pre code.hljs").first()).toBeVisible(); // default: on

  // Settings → Sessions → "Code highlighting" → Off.
  await openSettings(page, "Sessions");
  await page
    .locator("div.flex.items-start", { hasText: "Code highlighting" })
    .first()
    .getByRole("button", { name: "Off" })
    .click();

  // The Capture tab keeps the open note; its preview re-renders unhighlighted.
  await focusTab(page, "Capture");
  await notes.getByRole("tab", { name: "Read" }).click();
  await expect(notes.locator("pre code")).toContainText("const x");
  await expect(notes.locator("pre code.hljs")).toHaveCount(0);

  await openSettings(page, "Sessions");
  await page
    .locator("div.flex.items-start", { hasText: "Code highlighting" })
    .first()
    .getByRole("button", { name: "On" })
    .click();
});

test("/settings: semantic index builds locally and finds by meaning", async ({ desktop }) => {
  // Building the index loads the bundled ~23 MB model; allow for a cold first run.
  test.setTimeout(420_000);
  const { page } = desktop;

  // Offline proof: the model and the ORT wasm ship inside the app, so nothing
  // the index needs may leave the machine. Only http(s) requests to other
  // hosts are blocked; the app's own masarflow:// origin is untouched.
  const external: string[] = [];
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    const remote = /^https?:$/.test(url.protocol) && !["localhost", "127.0.0.1"].includes(url.hostname);
    if (!remote) return route.continue();
    external.push(url.href);
    return route.abort();
  });

  await addNote(page, "Login flow", "Users sign in with a JWT access token that expires after fifteen minutes.");
  await addNote(page, "Cake", "Chocolate cake needs eggs, flour and cocoa.");

  await openSettings(page, "Local AI Service");
  const status = page.getByTestId("semantic-status");
  const count = page.getByTestId("semantic-count");
  await page.getByRole("button", { name: "Rebuild index" }).click();
  await expect(status).toHaveText("Ready", { timeout: 180_000 });
  await expect.poll(async () => Number(await count.innerText()), { timeout: 60_000 }).toBeGreaterThanOrEqual(2);

  // The query shares no words with the note it must find, and must not surface the cake note.
  await navigateTo(page, "Semantic Search");
  const search = page.locator('[data-surface="library"]');
  const box = search.getByPlaceholder(/Search across/);
  await box.click();
  await box.fill("how do people authenticate");
  await expect(search.locator("[data-idx='0']")).toContainText("Login flow", { timeout: 120_000 });
  await expect(search.locator("[data-idx]").filter({ hasText: "Cake" })).toHaveCount(0);

  await page.unroute("**/*");
  test.info().annotations.push({ type: "blocked-external", description: external.join("\n") || "none" });
  expect(external.filter((u) => /huggingface|cdn|jsdelivr|unpkg|onnx/i.test(u))).toEqual([]);
});

test("/settings: export then import restores the workspace", async ({ desktop }) => {
  const { page } = desktop;
  const PROJECT = "E2E Project";

  // The export hands a Blob to an anchor download (and revokes its URL at
  // once). Capture the Blob and swallow the click instead of driving the OS
  // save dialog.
  await page.evaluate(() => {
    const w = window as unknown as { __backup?: Promise<string> };
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (obj: Blob | MediaSource) => {
      if (obj instanceof Blob && obj.type.includes("json")) w.__backup = obj.text();
      return create(obj);
    };
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      if (this.download && this.href.startsWith("blob:")) return;
      click.call(this);
    };
  });
  await openSettings(page, "Data");
  await page.getByRole("button", { name: "Export backup" }).click();
  await expect(page.getByText(/Backup exported \(\d+ records\)/)).toBeVisible();
  const text = await page.evaluate(() => (window as unknown as { __backup: Promise<string> }).__backup);
  const exported = JSON.parse(text) as { tables: Record<string, { name?: string }[]> };
  expect(exported.tables.projects.some((p) => p.name === PROJECT)).toBe(true);

  // Reset wipes the workspace. The first-run prompt may come back or fall back
  // to a default project on its own; dismiss it if it is there.
  await page.getByRole("button", { name: "Reset all data" }).click();
  await page.getByRole("button", { name: "Reset everything" }).click();
  await expect.poll(async () => (await readTable<{ name: string }>(page, "projects")).some((p) => p.name === PROJECT)).toBe(false);
  const skip = page.getByRole("button", { name: "Start with My Project" });
  await skip.waitFor({ state: "visible", timeout: 10_000 }).catch(() => undefined);
  await skip.click({ timeout: 3_000 }).catch(() => undefined);
  await page.keyboard.press("Escape");

  // Import: choose the exported file, then replace the workspace with it.
  await openSettings(page, "Data");
  await page.locator('input[type="file"]').setInputFiles({
    name: "masarflow-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(text),
  });
  await expect(page.getByText(/records, created/)).toBeVisible();
  await page.getByRole("button", { name: "Replace workspace" }).click();
  await expect(page.getByText(/Workspace restored \(\d+ records\)/)).toBeVisible();

  // The project is back and can be made active from the switcher.
  await expect.poll(async () => (await readTable<{ name: string }>(page, "projects")).map((p) => p.name)).toContain(PROJECT);
  await activateProject(page, PROJECT);
});

test("/dashboard: a corrupt database shows the recovery screen", async () => {
  const { page, close } = await launchApp({ seed: "project" });
  try {
    // Pin indexedDB.open("masarflow") to version 1 so opening the current
    // database fails with a VersionError on the next load.
    await page.addInitScript(() => {
      const open = indexedDB.open.bind(indexedDB);
      indexedDB.open = ((name: string, v?: number) =>
        name === "masarflow" ? open(name, 1) : open(name, v)) as unknown as typeof indexedDB.open;
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    const alert = page.getByRole("alert").filter({ hasText: "could not be opened" });
    await expect(alert).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  } finally {
    await close();
  }
});
