import { expect, type Page } from "@playwright/test";

/**
 * First-run helper (P9 stream B).
 *
 * In a fresh browser context the workspace layout shows the blocking first-run
 * prompt (`NewProjectDialog mode="first-run"`) until a project exists — see
 * `src/app/(workspace)/layout.tsx` (`firstRunOpen = !wizardOpen && projectCount
 * === 0`). A spec that navigates straight to a page and clicks its buttons hits
 * the dialog's backdrop instead, so every test that needs an interactive
 * workspace calls `ensureProject()` first.
 *
 * The helper drives the real dialog (the first-time-user path): it fills the
 * "Project name" field and clicks "Create project". Calling it when a project
 * already exists (e.g. after a second navigation in the same test) is a no-op —
 * it detects the existing row in IndexedDB instead of waiting for a dialog that
 * will never come.
 *
 * Note: the dialog is NOT in the server-rendered HTML (`useLiveQuery` resolves
 * only after hydration), so waiting for the input also waits out hydration.
 *
 * Implementation note: the readiness checks poll from Node with
 * `page.evaluate` + `waitForTimeout` on purpose. `page.waitForFunction` with an
 * *async* predicate resolves immediately (it truthy-checks the returned Promise
 * object, not its value), which silently skipped the create step.
 */

/** Counts project rows without ever creating the database: `indexedDB.databases()` gates the open. */
async function projectRowExists(page: Page): Promise<boolean> {
  try {
    return await page.evaluate(
      () =>
        new Promise<boolean>((resolve) => {
          if (typeof indexedDB.databases !== "function") {
            resolve(false);
            return;
          }
          indexedDB
            .databases()
            .then((dbs) => {
              if (!dbs.some((d) => d.name === "masarflow")) {
                resolve(false);
                return;
              }
              const open = indexedDB.open("masarflow");
              open.onerror = () => resolve(false);
              open.onblocked = () => resolve(false);
              open.onsuccess = () => {
                const db = open.result;
                if (!db.objectStoreNames.contains("projects")) {
                  db.close();
                  resolve(false);
                  return;
                }
                const g = db
                  .transaction("projects", "readonly")
                  .objectStore("projects")
                  .count();
                g.onsuccess = () => {
                  db.close();
                  resolve(g.result > 0);
                };
                g.onerror = () => {
                  db.close();
                  resolve(false);
                };
              };
            })
            .catch(() => resolve(false));
        }),
    );
  } catch {
    // The page may be mid-navigation; treat as "not ready yet".
    return false;
  }
}

async function waitFor(
  page: Page,
  what: string,
  cond: () => Promise<boolean>,
  timeoutMs: number,
): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (await cond()) return;
    if (Date.now() - start > timeoutMs) {
      throw new Error(
        `ensureProject: timed out after ${timeoutMs}ms waiting for ${what}`,
      );
    }
    await page.waitForTimeout(250);
  }
}

export async function ensureProject(
  page: Page,
  name = "E2E Project",
): Promise<string> {
  const nameField = page.getByPlaceholder("Project name");

  // 1. Either a project already exists (second navigation in a test) or the
  //    first-run prompt shows up once Dexie has loaded.
  await waitFor(
    page,
    "the first-run prompt or an existing project",
    async () => (await nameField.count()) > 0 || (await projectRowExists(page)),
    30_000,
  );

  if ((await nameField.count()) > 0) {
    // 2. Drive the real dialog.
    await nameField.fill(name);
    await page.getByRole("button", { name: "Create project" }).click();
    // 3. Wait until the write is visible in IndexedDB (the layout's liveQuery
    //    flips on the same row, which is what actually dismisses the prompt).
    await waitFor(
      page,
      "the created project row",
      () => projectRowExists(page),
      30_000,
    );
  }

  // 4. Past the prompt for good: dialog gone and the project row present.
  await expect(nameField).toHaveCount(0, { timeout: 15_000 });
  await waitFor(
    page,
    "the project row (post-check)",
    () => projectRowExists(page),
    15_000,
  );

  return name;
}
