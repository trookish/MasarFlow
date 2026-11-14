/**
 * P9.T18 — /files on the PACKAGED app.
 *
 * "/files: lists vault attachments and finds one by name"
 *
 * Attachments only enter the app through an Obsidian pull (sync-view decides
 * which vault files are binary and indexes them as `attachment:<vault path>`).
 * The pull runs against a loopback Obsidian REST stub, but through the REAL
 * /api/obsidian proxy and the real import path — so this proves the /files view
 * renders the rows the app itself created, not a seeded fixture.
 */
import { expect, launchApp, navigateTo, readTable, surfacePanel, test } from "./_harness";
import { startObsidianStub, stopAllObsidianStubs } from "./_obsidian-stub";

const FILES_TITLE = "/files: lists vault attachments and finds one by name";

test.afterAll(async () => {
  await stopAllObsidianStubs();
});

function syncPanel(page: import("@playwright/test").Page) {
  // /sync is a section of the System surface, so its panel is the System tab.
  return surfacePanel(page, "Sync Panel");
}

test(FILES_TITLE, async () => {
  test.setTimeout(180_000);
  const stub = await startObsidianStub();
  const app = await launchApp({ seed: "demo" });
  const { page } = app;
  try {
    // Pull two binary files into the workspace through the sync panel.
    await navigateTo(page, "Sync Panel");
    const sync = syncPanel(page);
    await sync.getByRole("button", { name: "Obsidian" }).click();
    await sync.getByPlaceholder("https://127.0.0.1:27124").fill(stub.baseUrl);
    await sync
      .getByPlaceholder("Paste from the plugin settings")
      .fill(stub.apiKey);

    const pull = sync.getByRole("button", { name: /^Pull/ });
    await expect(pull).toBeEnabled({ timeout: 20_000 });
    await pull.click();
    await expect(sync.getByText(/Pull complete/)).toBeVisible({ timeout: 30_000 });

    // The app really indexed both binaries as attachments (its own DB rows).
    const rows = await readTable<{ path: string; entityId: string | null }>(
      page,
      "syncFiles",
    );
    const attachments = rows
      .map((r) => r.entityId)
      .filter((id): id is string => Boolean(id?.startsWith("attachment:")));
    expect(attachments).toEqual(
      expect.arrayContaining([
        "attachment:attachments/diagram.png",
        "attachment:attachments/screen-shot.png",
      ]),
    );

    // /files lists those rows by name and path.
    await navigateTo(page, "Files");
    const files = surfacePanel(page, "Files");
    await expect(files.getByText("Vault Files & Attachments")).toBeVisible({
      timeout: 20_000,
    });
    await expect(files.getByText("diagram.png", { exact: true })).toBeVisible();
    await expect(files.getByText("screen-shot.png", { exact: true })).toBeVisible();
    await expect(files.getByText("attachments/diagram.png", { exact: true })).toBeVisible();

    // The search box finds one by name...
    const search = files.getByPlaceholder("Search files...");
    await search.fill("screen");
    await expect(files.getByText("screen-shot.png", { exact: true })).toBeVisible();
    await expect(files.getByText("diagram.png", { exact: true })).toHaveCount(0);

    // ...and the other file comes back when the query names it.
    await search.fill("diagram");
    await expect(files.getByText("diagram.png", { exact: true })).toBeVisible();
    await expect(files.getByText("screen-shot.png", { exact: true })).toHaveCount(0);

    // A query that matches nothing shows an empty grid, not a stale list.
    await search.fill("no-such-attachment");
    await expect(files.getByText("diagram.png", { exact: true })).toHaveCount(0);
    await expect(files.getByText("screen-shot.png", { exact: true })).toHaveCount(0);
  } finally {
    await app.close();
    await stub.stop();
  }
});
