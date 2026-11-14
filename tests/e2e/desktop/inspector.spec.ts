import { test, expect, navigateTo, readTable, setWindowContentSize, surfacePanel } from "./_harness";

/**
 * The Inspector and the page header in the packaged app: the surface name and description are said
 * once, the Inspector explains each page's selection, floats over full-width pages and can be
 * opened on a narrow window.
 */

const TODAY_DESCRIPTION = "What needs attention now across the active project.";

test("/today: the surface description appears once, not again in the inspector", async ({ desktop }) => {
  const { page } = desktop;
  const inspector = page.getByTestId("inspector");
  await expect(inspector).toBeVisible({ timeout: 30_000 });
  await expect(inspector.getByText("Nothing selected")).toBeVisible();
  await expect(inspector.getByText(TODAY_DESCRIPTION)).toHaveCount(0);
  await expect(page.getByText(TODAY_DESCRIPTION, { exact: true }).filter({ visible: true })).toHaveCount(0);
  // Assistive tech still gets the surface name as the page's top-level heading.
  await expect(page.locator("h1").filter({ hasText: /^Today$/ })).toHaveCount(1);
});

test("/work: the inspector floats over the board and a task opens in it", async ({ desktop }) => {
  const { page, app } = desktop;
  await setWindowContentSize(app, 1440, 900);
  await navigateTo(page, "Task Boards");
  const board = surfacePanel(page, "Task Boards");
  const inspector = page.getByTestId("inspector");

  // The board keeps its width: nothing is docked beside it.
  await expect(page.getByTestId("inspector-overlay")).toHaveCount(0);
  await expect(inspector).toHaveCount(0);

  const tasks = await readTable<{ title: string }>(page, "tasks");
  let title = "";
  await expect(async () => {
    for (const t of tasks) {
      if ((await board.getByText(t.title, { exact: true }).filter({ visible: true }).count()) > 0) {
        title = t.title;
        return;
      }
    }
    throw new Error("no task visible on the board");
  }).toPass({ timeout: 20_000 });

  await board.getByText(title, { exact: true }).filter({ visible: true }).first().click();
  const overlay = page.getByTestId("inspector-overlay");
  await expect(overlay).toBeVisible({ timeout: 15_000 });
  await expect(overlay.getByPlaceholder("Task title")).toHaveValue(title);
  // The board is still on screen and interactive behind the panel: no modal dialog.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(board.getByRole("button", { name: "New task" }).first()).toBeVisible();

  // Pinning docks it as a column; unpinning floats it again.
  await overlay.getByRole("button", { name: "Dock inspector" }).click();
  await expect(page.getByTestId("inspector")).toHaveAttribute("data-inspector-presentation", "docked");
  await page.getByTestId("inspector").getByRole("button", { name: "Float inspector" }).click();
  await expect(page.getByTestId("inspector")).toHaveAttribute("data-inspector-presentation", "overlay");

  // Closing the task clears the selection and puts the floating panel away.
  await page.getByTestId("inspector").getByRole("button", { name: "Close" }).click();
  await expect(page.getByTestId("inspector-overlay")).toHaveCount(0);
});

test("/today: the inspector can be opened at the smallest supported window", async ({ desktop }) => {
  const { page, app } = desktop;
  await setWindowContentSize(app, 1000, 700);
  await expect(page.getByTestId("inspector")).toHaveCount(0);
  const toggle = page.getByRole("button", { name: "Show inspector" });
  await expect(toggle).toBeVisible();
  await toggle.click();
  const inspector = page.getByTestId("inspector");
  await expect(inspector).toHaveAttribute("data-inspector-presentation", "overlay");
  await expect(inspector.getByText("Nothing selected")).toBeVisible();
  // Escape dismisses the floating panel.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("inspector")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Show inspector" })).toBeVisible();
});
