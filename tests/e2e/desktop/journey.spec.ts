import { mkdirSync } from "node:fs";
import path from "node:path";
import {
  test,
  expect,
  launchApp,
  createFirstProject,
  waitForShellReady,
  navigateTo,
  addStubConnection,
  packagedExe,
  readTable,
  REPO_ROOT,
} from "./_harness";
import { startStubProvider, stopAllStubs } from "./_stub-provider";

/**
 * P9.T23 — the first-time-user journey, minus the OS-level install (P10 owns
 * that). One fresh profile, one run through the P10 setup wizard, then a
 * restart — the restart is the step that catches origin/storage bugs, which is
 * exactly what the masarflow://app architecture risks.
 *
 * Every step goes through the product UI: the wizard, the dock, the note
 * editor, the board, the Connections dialog and the chat composer. The AI
 * provider is stream B's loopback stub (`_stub-provider.ts`), saved through the
 * real "AI connections" dialog, so the send exercises the real wire offline.
 */

const SHOTS = path.join(REPO_ROOT, "reports", "p9", "journey");

function shot(page: import("@playwright/test").Page, name: string): Promise<Buffer> {
  mkdirSync(SHOTS, { recursive: true });
  return page.screenshot({ path: path.join(SHOTS, name) });
}

/**
 * The first VISIBLE element containing `text`. Dock panels keep their inactive
 * siblings mounted (hidden) and the dashboard mirrors task/note titles, so a
 * bare `.first()` can resolve to a hidden copy and toBeVisible() then fails.
 */
function visibleText(page: import("@playwright/test").Page, text: string | RegExp) {
  return page.getByText(text).filter({ visible: true }).first();
}

/**
 * Closes a dock group via its tab's hover-revealed Close button. The journey
 * opens a group per route; five squeezed groups starve the chat's sidebar and
 * conversation column to zero width, so spent groups are closed to give the
 * chat its dock width back before UI there is asserted.
 */
async function closeGroup(page: import("@playwright/test").Page, label: string): Promise<void> {
  await page.getByRole("tab", { name: label }).hover();
  await page.getByRole("button", { name: `Close ${label}` }).click();
  await expect(page.getByRole("tab", { name: label })).toHaveCount(0, { timeout: 10_000 });
}

test.afterAll(async () => {
  await stopAllStubs();
});

test("/journey: install-free onboarding survives a restart", async () => {
  test.setTimeout(10 * 60 * 1000);
  const stub = await startStubProvider();
  const first = await launchApp({ seed: "none" });
  const profileArg = `--user-data-dir=${first.profileDir}/profile`;
  const stamp = Date.now();
  const projectName = `Journey project ${stamp}`;
  const noteTitle = `Journey note ${stamp}`;
  const taskTitle = `Journey task ${stamp}`;
  const chatTitle = `Journey chat ${stamp}`;

  try {
    const page = first.page;

    // 0–1. First launch on a fresh profile: the setup wizard owns the screen.
    await shot(page, "00-launch.png");
    const wizard = page.getByRole("dialog", { name: "Set up MasarFlow" });
    await expect(wizard).toBeVisible({ timeout: 60_000 });
    await expect(wizard.getByText("Welcome to MasarFlow")).toBeVisible();
    await shot(page, "01-first-run.png");

    // 2. Create the first project through the wizard; the shell becomes interactive.
    await createFirstProject(page, projectName);
    await expect(page.getByTestId("shell-ready")).toBeVisible();
    await shot(page, "02-shell.png");

    // 3. Write a note in Brain.
    await navigateTo(page, "Brain");
    await page.getByRole("button", { name: "New note" }).first().click();
    const titleInput = page.getByPlaceholder("Untitled note");
    await titleInput.fill(noteTitle);
    await page.locator(".cm-content").first().click();
    await page.keyboard.insertText(`# ${noteTitle}\n\nWritten by the journey spec.`);
    // The note row only shows the new title after the editor's debounced save.
    await expect(visibleText(page, noteTitle)).toBeVisible({ timeout: 15_000 });
    await shot(page, "03-note.png");

    // 4. Create a task on the board with the board view's OWN "New task"
    // button (direct create). The dashboard's "New task" once created
    // duplicates under load (3 from one click); it now carries a one-shot
    // ?new=<nonce> and planning.spec covers it, so this journey keeps the
    // board path. The board button opens the
    // task-detail dialog directly; the title saves on blur, then the dialog
    // has to be closed — its backdrop covers the dock, so the next navigateTo
    // cannot click a group button.
    await navigateTo(page, "Task Boards");
    const tasksPanel = page.locator('[data-testid="dock-panel"][data-dock-url="/tasks"]');
    await tasksPanel.getByRole("button", { name: "New task" }).click();
    const taskTitleInput = page.getByPlaceholder("Task title");
    await taskTitleInput.fill(taskTitle);
    await taskTitleInput.press("Tab");
    await shot(page, "04-task.png");
    await page.getByRole("dialog").getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 15_000 });
    // The row behind the dialog now carries the saved title (blur patched it).
    await expect(visibleText(page, taskTitle)).toBeVisible({ timeout: 15_000 });

    // 5. Connect an AI provider through the real dialog, then chat through it.
    await addStubConnection(page, stub.baseUrl);
    await navigateTo(page, "Chat");
    await page.getByRole("button", { name: "New chat" }).first().click();
    const composer = page.getByPlaceholder(/Message the model directly|Ask about/);
    await expect(composer).toBeVisible({ timeout: 30_000 });
    // A brand-new thread has no connection selected, so a plain send would be
    // refused with "Select an AI connection from the header and retry".
    // Repoint it at the stub connection with the same /model command the
    // studio spec uses — consumed locally, it never reaches the network.
    await composer.fill("/model E2E stub:stub-model");
    await page.getByRole("button", { name: "Send" }).click();
    // Assert the repoint from the app's own database: the chat group is
    // squeezed to ~86px by the panels opened above, where the notice collapses
    // to zero width and a visible-text assertion would measure layout.
    await expect
      .poll(
        async () => {
          const threads = await readTable<{ modelId?: string }>(page, "chatThreads");
          return threads.some((t) => t.modelId === "stub-model");
        },
        { timeout: 15_000 },
      )
      .toBe(true);
    await expect(async () => {
      // The provider catalog may still be loading on the first click; retry.
      await composer.fill("hello from the journey");
      await page.getByRole("button", { name: "Send" }).click();
      // Read the wire from the app's own database — the reply renders in the
      // starved conversation column, so visibility would measure layout.
      await expect
        .poll(
          async () => {
            const messages = await readTable<{ role: string; content: string }>(
              page,
              "chatMessages",
            );
            return messages.some(
              (m) =>
                m.role === "assistant" &&
                m.content.includes("STUB-REPLY hello from the journey"),
            );
          },
          { timeout: 20_000 },
        )
        .toBe(true);
    }).toPass({ timeout: 90_000, intervals: [1_000, 2_000, 4_000] });
    // Close the panels this journey no longer needs so the chat group gets
    // the dock width back — its sidebar row and conversation column are
    // clipped to zero width at the five-group layout.
    await closeGroup(page, "AI Agents");
    await closeGroup(page, "Brain");
    await closeGroup(page, "Task Boards");
    // Name the thread so the restart can find it by a unique title.
    await page.getByRole("button", { name: "Rename chat" }).first().click();
    await page.keyboard.press("Control+a");
    await page.keyboard.type(chatTitle);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: chatTitle })).toBeVisible({ timeout: 15_000 });
    await shot(page, "05-chat.png");
  } finally {
    await first.close();
  }

  // 7. Restart on the same profile — nothing is lost, and the wizard stays gone.
  const { _electron: electron } = await import("@playwright/test");
  const app2 = await electron.launch({
    executablePath: packagedExe(),
    args: [profileArg],
    env: { ...(process.env as Record<string, string>), MASARFLOW_E2E: "1" },
  });
  try {
    const page2 = await app2.firstWindow();
    await page2.waitForSelector('[data-testid="app-shell"]', { timeout: 120_000 });
    await waitForShellReady(page2);
    // No first-run prompt for an existing, fully set-up install.
    await expect(page2.getByRole("dialog")).toHaveCount(0);
    await expect(visibleText(page2, projectName)).toBeVisible();

    await navigateTo(page2, "Brain");
    await expect(visibleText(page2, noteTitle)).toBeVisible({ timeout: 15_000 });

    await navigateTo(page2, "Task Boards");
    await expect(visibleText(page2, taskTitle)).toBeVisible({ timeout: 15_000 });

    // Brain and Task Boards reopened for the checks above; close them again
    // so the chat group is wide enough for the thread row and the reply.
    await closeGroup(page2, "Brain");
    await closeGroup(page2, "Task Boards");
    await navigateTo(page2, "Chat");
    const threadRow = page2.getByRole("button", { name: chatTitle });
    await expect(threadRow).toBeVisible({ timeout: 15_000 });
    await threadRow.click();
    await expect(visibleText(page2, /STUB-REPLY/)).toBeVisible({ timeout: 15_000 });

    await shot(page2, "07-restart.png");
  } finally {
    await app2.close().catch(() => {});
  }
});
