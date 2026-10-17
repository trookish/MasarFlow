import { test, expect, packagedExe, REPO_ROOT } from "./_harness";

test("/shell: packaged app boots on a clean profile", async ({ desktop }) => {
  const { page, app } = desktop;
  expect(packagedExe()).toContain("win-unpacked");
  expect(await app.evaluate(({ app }) => app.getVersion())).toMatch(/\d+\.\d+/);
  await expect(page.getByTestId("app-shell")).toBeVisible();
  expect(page.url().startsWith("masarflow://app")).toBe(true);
  void REPO_ROOT;
});
