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
    // Interactive means: the dock workspace is up, the project is active in
    // the switcher, and the dashboard is docked as a panel.
    await expect(page.getByTestId("shell-ready")).toBeVisible();
    await expect(page.getByText("First Run E2E").first()).toBeVisible();
    await expect(page.locator('[data-dock-tab][data-dock-url="/dashboard"]')).toHaveCount(1);
  } finally {
    await close();
  }
});

test("/dashboard: demo project seeds and the dashboard renders its data", async ({ desktop }) => {
  const { page } = desktop;
  // The fixture seeds Pulse and activates it through the topbar switcher; the
  // switcher is the truthful signal ("Pulse" also appears in /settings copy).
  await expect(page.getByRole("banner").getByRole("button").first()).toContainText(
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
  // The plugins page renders inside the dock panel it opened (the real markup
  // has no page heading — the toolbar label and the catalog are the truth).
  await expect(page.locator('[data-testid="dock-panel"][data-dock-url="/plugins"]')).toHaveCount(1);
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
