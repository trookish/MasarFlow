import { test, expect } from "@playwright/test";
import { ensureProject } from "./_helpers/first-run";

/**
 * P9.T11 / F8 — `chat.codeHighlighting` actually toggles syntax highlighting.
 *
 * Before the fix, MarkdownPreview hard-wired rehype-highlight, so switching
 * the setting off changed nothing (the plan's F8 "one dead setting key").
 * This spec drives the real user path in the browser app:
 *   1. a note with a fenced code block renders highlighted by default;
 *   2. Settings → Chat → "Code highlighting" → Off;
 *   3. reopening the note shows the preview without hljs classes.
 */
// The dock tiles panes side by side; a wide viewport keeps pane contents
// clear of each other's overlaps.
test.use({ viewport: { width: 1680, height: 1000 } });

test("/settings: code highlighting applies to note preview", async ({
  page,
}) => {
  await page.goto("/brain", { waitUntil: "domcontentloaded" });
  await ensureProject(page);

  // Create a note with a fenced code block. Tilde fences: CodeMirror's markdown
  // keymap can rewrite backtick fences; `~~~` is equivalent and stable to type.
  await page.getByRole("button", { name: "New note" }).first().click();
  const title = page.getByPlaceholder("Untitled note");
  await title.fill("P9 highlight note");
  await page.locator(".cm-content").first().click();
  await page.keyboard.insertText("~~~ts\nconst x: number = 1;\n~~~");
  // The editor autosaves on a 450ms debounce (note-editor.tsx); wait until the
  // note list reflects the saved body before switching views.
  await expect(
    page.getByRole("button", { name: /P9 highlight note/ }).first(),
  ).toContainText("const x", { timeout: 10_000 });

  await page.getByRole("tab", { name: "Read" }).click();
  await expect(page.locator("pre code.hljs").first()).toBeVisible(); // default: on

  // Turn the setting off: Settings → Chat → "Code highlighting" → Off.
  await page.goto("/settings", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Chat", exact: true }).first().click();
  // SettingRow markup: a flex row with the label as text and the Toggle's
  // On/Off buttons as siblings (settings-view.tsx SettingRow).
  await page
    .locator("div.flex.items-start", { hasText: "Code highlighting" })
    .first()
    .getByRole("button", { name: "Off" })
    .click();

  // Close the Settings pane: its 208px nav column overlaps the neighbouring
  // Brain pane in the tiled dock and would intercept the Read tab click.
  await page.locator('[data-dock-tab][data-dock-url="/settings"]').hover();
  await page.getByRole("button", { name: "Close Settings" }).click();

  // A full page load does not restore the editor's selected note, so reopen it
  // via the Dashboard pane's "Recent notes" link (/brain?note=<id>).
  await page.locator('a[href^="/brain?note="]').first().click();
  await page.getByRole("tab", { name: "Read" }).click();
  // Guard against a vacuous pass: the code block itself must be rendered
  // (unhighlighted), or an unopened note would satisfy the count below.
  await expect(page.locator("pre code")).toContainText("const x");
  await expect(page.locator("pre code.hljs")).toHaveCount(0);
});
