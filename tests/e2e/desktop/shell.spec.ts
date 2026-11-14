import {
  test,
  expect,
  launchApp,
  createFirstProject,
  waitForShellReady,
  navigateTo,
  packagedExe,
  backendPort,
  removeProfile,
  DEMO_WEB_PROJECT,
  REPO_ROOT,
} from "./_harness";

test("/shell: packaged app boots on a clean profile", async ({ desktop }) => {
  const { page, app } = desktop;
  expect(packagedExe()).toContain("win-unpacked");
  expect(await app.evaluate(({ app }) => app.getVersion())).toMatch(/\d+\.\d+/);
  await expect(page.getByTestId("app-shell")).toBeVisible();
  expect(page.url().startsWith("masarflow://app")).toBe(true);
  void REPO_ROOT;
});

test("/dashboard: first-run dialog creates the first project and the shell becomes interactive", async () => {
  const { page, close } = await launchApp({ seed: "none" });
  try {
    // A clean profile with zero projects shows the blocking first-run UI (the
    // P10 setup wizard in the packaged app; the bare dialog otherwise).
    await createFirstProject(page, "First Run E2E");
    // Interactive means: the workspace is up, the project is active in the switcher, and
    // the shell opened its boot route — "/" redirects to /dashboard, which is the
    // Dashboard section of the Today surface (src/lib/navigation/redirects.ts).
    await expect(page.getByTestId("shell-ready")).toBeVisible();
    await expect(page.getByText("First Run E2E").first()).toBeVisible();
    await expect(page.locator('[data-dock-tab][data-dock-url="/today"]')).toHaveCount(1);
    await expect(page.locator('[data-surface="today"]')).toHaveAttribute("data-section", "dashboard");
  } finally {
    await close();
  }
});

test("/dashboard: first-run setup wizard", async () => {
  // A never-configured install opens the setup wizard by itself.
  const { page, close } = await launchApp({ seed: "none" });
  try {
    const wizard = page.getByRole("dialog", { name: "Set up MasarFlow" });
    await expect(wizard).toBeVisible({ timeout: 60_000 });

    // 1. welcome: the local-first promise, no Skip, and the bare first-run dialog is not underneath.
    await expect(wizard.getByText("stays on this computer")).toBeVisible();
    await expect(wizard.getByRole("button", { name: /^Skip$/ })).toHaveCount(0);
    await expect(page.getByPlaceholder("Project name")).toHaveCount(0);

    // 2. project: Continue is blocked until a project exists.
    await wizard.getByRole("button", { name: /^Continue$/ }).click();
    await expect(wizard.getByRole("button", { name: /^Continue$/ })).toBeDisabled();
    await wizard.getByRole("button", { name: /Create a project/ }).click();
    const projectDialog = page.getByRole("dialog").filter({ has: page.getByPlaceholder("Project name") });
    await projectDialog.getByPlaceholder("Project name").fill("Wizard Project");
    await projectDialog.getByRole("button", { name: "Create project" }).click();
    await expect(wizard.getByText("Project ready.")).toBeVisible({ timeout: 30_000 });

    // 3. folder, 4. provider (the no-key path exists), 5. migrate: each is skippable.
    await wizard.getByRole("button", { name: /^Continue$/ }).click();
    await expect(wizard.getByText(/Link the folder on this computer/)).toBeVisible();
    await wizard.getByRole("button", { name: /^Skip$/ }).click();
    await expect(wizard.getByText(/Choose an AI provider/)).toBeVisible();
    await expect(wizard.getByRole("button", { name: /No key needed yet/ })).toBeVisible();
    await wizard.getByRole("button", { name: /^Skip$/ }).click();
    await expect(wizard.getByText(/Coming from an older MasarFlow/)).toBeVisible();
    await wizard.getByRole("button", { name: /^Skip$/ }).click();

    // 6. finish: the wizard closes and stays closed after a reload.
    await expect(wizard.getByText(/You're set/)).toBeVisible();
    await wizard.getByRole("button", { name: /Close|Start using MasarFlow/ }).click();
    await expect(wizard).toHaveCount(0);
    await waitForShellReady(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForShellReady(page);
    await expect(page.getByRole("dialog", { name: "Set up MasarFlow" })).toHaveCount(0);
    await expect(page.getByPlaceholder("Project name")).toHaveCount(0);
  } finally {
    await close();
  }
});

test("/dashboard: demo project seeds and the dashboard renders its data", async ({ desktop }) => {
  const { page } = desktop;
  // The fixture seeds Pulse and activates it through the topbar switcher; the
  // switcher is the truthful signal ("Pulse" also appears in /settings copy).
  await expect(page.getByTestId("project-switcher")).toContainText(
    DEMO_WEB_PROJECT,
  );
  // demo-seed.ts seeds dev logs for Pulse ("Deploy webhooks live for beta",
  // 2h old) which the dashboard's Recent activity card renders.
  await expect(
    page.getByText(/Deploy webhooks live for beta|SPEC-001 hit 55%/).first(),
  ).toBeVisible();
});

test("/plugins: catalog lists plugins with their install state", async ({ desktop }) => {
  const { page } = desktop;
  await navigateTo(page, "Plugins");
  // The catalog is a section of the System surface (/plugins redirects to
  // /system?view=features — the real markup has no page heading, so the section
  // and the catalog rows are the truth).
  await expect(page.locator('[data-surface="system"]')).toHaveAttribute("data-section", "features");
  await expect(page.getByText("Mermaid Diagrams").first()).toBeVisible();
  const installButtons = page.getByRole("button", { name: /^Install/ });
  const installedBadges = page.getByText(/Installed/i);
  expect((await installButtons.count()) + (await installedBadges.count())).toBeGreaterThan(0);
});

test("shell: data survives an app restart on the same profile", async () => {
  const first = await launchApp({ seed: "none" });
  await createFirstProject(first.page, "Persist E2E");
  const port1 = backendPort(first.profileDir);
  await first.close();

  // Relaunch with the SAME profile dir: same userData, same masarflow://app origin.
  const profileArg = `--user-data-dir=${first.profileDir}/profile`;
  const { _electron: electron } = await import("@playwright/test");
  const app2 = await electron.launch({
    executablePath: packagedExe(),
    args: [profileArg],
    env: { ...(process.env as Record<string, string>) },
  });
  try {
    const page2 = await app2.firstWindow();
    await page2.waitForSelector('[data-testid="app-shell"]', { timeout: 120_000 });
    await waitForShellReady(page2);
    await expect(page2.getByText("Persist E2E").first()).toBeVisible();
    // The first-run dialog must NOT come back for an existing project.
    await expect(page2.getByRole("dialog")).toHaveCount(0);
    // The app origin is stable across restarts; the embedded server's loopback
    // port is not — it is picked fresh on every boot (D2's isolation).
    expect(page2.url().startsWith("masarflow://app")).toBe(true);
    const port2 = backendPort(first.profileDir);
    expect(port2).not.toBe(port1);
  } finally {
    await app2.close().catch(() => {});
    removeProfile(first.profileDir);
  }
});
