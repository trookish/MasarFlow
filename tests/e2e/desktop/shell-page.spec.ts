import { test, expect, navigateTo, surfacePanel } from "./_harness";

/**
 * The Page Shell (overhaul phase 2): one row-height token for every list, one header per page, and
 * a status bar that reports the current selection instead of repeating the topbar.
 */
test("/settings: row density switches the whole app between comfortable and compact", async ({
  desktop,
}) => {
  const { page } = desktop;
  const shell = page.getByTestId("app-shell");
  const rowHeight = () =>
    page.evaluate(() => {
      const el = document.querySelector('[data-testid="app-shell"]');
      return el ? getComputedStyle(el).getPropertyValue("--row-h").trim() : "";
    });

  await expect(shell).toHaveAttribute("data-density", "comfortable");
  await expect.poll(rowHeight).toBe("36px");

  await navigateTo(page, "Settings");
  await page.getByRole("button", { name: "Interface", exact: true }).first().click();
  // A real row, not just the token: settings rows take their minimum height from --row-h.
  const row = page.locator('[data-setting-row="Row density"]');
  const rowMinHeight = () =>
    row.evaluate((el) => getComputedStyle(el as HTMLElement).minHeight);
  expect(await rowMinHeight()).toBe("52px");

  await page.getByRole("button", { name: "Compact", exact: true }).click();

  await expect(shell).toHaveAttribute("data-density", "compact");
  // The token every row reads actually changed, not just the attribute.
  await expect.poll(rowHeight).toBe("28px");
  // …and the row on screen follows the same step.
  await expect.poll(rowMinHeight).toBe("44px");

  // The choice is a setting, not session state.
  await page.reload();
  await page.getByTestId("shell-ready").waitFor({ timeout: 60_000 });
  await expect(page.getByTestId("app-shell")).toHaveAttribute("data-density", "compact");
  await expect.poll(rowHeight).toBe("28px");

  // Back to the default so later specs in the run see the documented layout.
  await navigateTo(page, "Settings");
  await page.getByRole("button", { name: "Interface", exact: true }).first().click();
  await page.getByRole("button", { name: "Comfortable", exact: true }).click();
  await expect(page.getByTestId("app-shell")).toHaveAttribute("data-density", "comfortable");
});

test("/work: the status bar reports the selection and the header names the page once", async ({
  desktop,
}) => {
  const { page } = desktop;
  await navigateTo(page, "Task Boards");
  const board = surfacePanel(page, "Task Boards");
  const status = page.getByRole("contentinfo", { name: "Status bar" });

  // One heading for the page, and no second copy of it in chrome above the board.
  await expect(page.getByRole("heading", { name: "Task Boards" })).toHaveCount(1);
  await expect(status).toBeVisible();
  await expect(status.getByRole("button", { name: "Show the Inspector" })).toBeVisible();
  await expect(status.getByText("Nothing selected")).toBeVisible();

  // Creating a task opens it in the Inspector, and the bar says what is selected.
  await board.getByRole("button", { name: "New task" }).click();
  const editor = page.getByTestId("task-editor");
  await expect(editor).toBeVisible({ timeout: 15_000 });
  await expect(status.getByText("Task selected")).toBeVisible();

  await editor.getByRole("button", { name: "Close" }).click();
  await expect(editor).toHaveCount(0, { timeout: 15_000 });
  await expect(status.getByText("Nothing selected")).toBeVisible();
});
