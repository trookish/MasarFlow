import { test, expect, navigateTo, activateProject, DEMO_WEB_PROJECT } from "./_harness";
import { snapshotIndexedDb, writeAudit } from "./_audit";
import { runDoctorOnSnapshot, type DbSnapshot } from "../../../src/lib/db/doctor";

/**
 * P0.T5 data doctor against the packaged app. Seeds the demo, deletes one project through the
 * product UI (the D5 cascade case), then runs the doctor over the real IndexedDB rows.
 * Records only in P0; from P2 on every count must be zero.
 */
test("harness: data doctor", async ({ desktop }) => {
  const { page } = desktop;
  const before = runDoctorOnSnapshot((await snapshotIndexedDb(page)) as DbSnapshot);

  // Delete the active demo project the way a user does: Settings → Project → Delete.
  await activateProject(page, DEMO_WEB_PROJECT);
  await navigateTo(page, "Settings");
  await page.getByRole("button", { name: "Delete project", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Delete project" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Delete project", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  const deleted = true;
  const after = runDoctorOnSnapshot((await snapshotIndexedDb(page)) as DbSnapshot);
  writeAudit("data-doctor.json", { deletedProject: deleted ? DEMO_WEB_PROJECT : null, before, after });
  expect(after.results).toHaveLength(5);
});
