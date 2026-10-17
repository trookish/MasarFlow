/**
 * P9.T8 — matrix sweep for the knowledge routes on the PACKAGED app:
 * /brain, /brain/graph, /brain/templates, /knowledge, /search.
 *
 * The demo fixture (Pulse) is the local database these tests read from:
 * - notes "North Star: Live by Default" and "Dashboard UX" carry a real
 *   wikilink edge between them (`[[North Star: Live by Default]]` in the
 *   Dashboard UX body), so the Connections pane and the graph have data;
 * - SPEC SPEC-001 ("Realtime Presence & Deploy Streams") is linked to both
 *   notes and to a task, so /knowledge has cross-category nodes.
 * Nothing is seeded by hand: every assertion drives the product UI or reads
 * what the app itself persisted (readTable).
 *
 * One app per worker (like today.spec.ts), reused by every test in the file.
 */
import { test as base } from "@playwright/test";
import {
  expect,
  launchApp,
  navigateTo,
  readTable,
  waitForShellReady,
  type AppHandle,
} from "./_harness";

const test = base.extend<object, { desktop: AppHandle }>({
  desktop: [
    async ({}, provide) => {
      const handle = await launchApp({ seed: "demo" });
      await provide(handle);
      await handle.close();
    },
    { scope: "worker" },
  ],
});

const CREATE_TITLE = "/brain: create a note and read it back";
const WIKILINK_TITLE = "/brain: wikilinks open in preview";
const CONNECTIONS_TITLE = "/brain: connections list";
const RELOAD_TITLE = "/brain: reload restores the open note";
const GRAPH_TITLE = "/brain/graph: linked notes render as graph nodes";
const TEMPLATES_TITLE = "/brain/templates: create a template";
const KNOWLEDGE_TITLE = "/knowledge: lists entities and opens one";
const SEARCH_TITLE = "/search: fuzzy search finds a seeded note";

/**
 * The dock group showing the notes page. `data-dock-url` is the group's panel
 * id — a bare route path; a panel's ?query selection lives in the dock's
 * per-panel params, mirrored into the app URL only while the panel is
 * focused. Assert selection through the editor or page.url(), never through
 * this attribute.
 */
function notesPanel(page: import("@playwright/test").Page) {
  return page.locator(
    '[data-testid="dock-panel"][data-dock-url="/brain"], [data-testid="dock-panel"][data-dock-url^="/brain?"]',
  );
}

test(CREATE_TITLE, async ({ desktop }) => {
  const { page } = desktop;
  await navigateTo(page, "Brain");
  const brain = notesPanel(page);
  await expect(brain.getByRole("button", { name: "New note" }).first()).toBeVisible({
    timeout: 20_000,
  });

  const title = `P9 knowledge note ${Date.now()}`;
  await brain.getByRole("button", { name: "New note" }).first().click();
  const titleInput = brain.getByPlaceholder("Untitled note");
  await expect(titleInput).toHaveValue("Untitled note", { timeout: 15_000 });
  await titleInput.fill(title);
  await expect(titleInput).toHaveValue(title);

  // Write a markdown body through the real editor, then read it back in preview.
  await brain.locator(".cm-content").first().click();
  await page.keyboard.insertText(`# ${title}\n\nCaptured by the packaged P9 knowledge spec.`);
  await brain.getByRole("tab", { name: "Read" }).click();
  await expect(brain.getByRole("heading", { name: title })).toBeVisible({ timeout: 15_000 });

  // The editor autosaves (450 ms) and the list is a live query: wait for the
  // list item to show the new title, or readTable races the save.
  await expect(brain.locator("button", { hasText: title }).first()).toBeVisible({
    timeout: 15_000,
  });

  // The note is really in the local database, with the body just typed.
  const notes = await readTable<{ id: string; title: string; body: string }>(page, "notes");
  const saved = notes.filter((n) => n.title === title);
  expect(saved).toHaveLength(1);
  expect(saved[0].body).toContain(`# ${title}`);
});

test(WIKILINK_TITLE, async ({ desktop }) => {
  const { page } = desktop;
  await navigateTo(page, "Brain");
  const brain = notesPanel(page);

  // "Dashboard UX" links out to "North Star: Live by Default" in its body.
  await brain.getByText("Dashboard UX", { exact: true }).first().click();
  await expect(brain.getByPlaceholder("Untitled note")).toHaveValue("Dashboard UX", {
    timeout: 15_000,
  });

  await brain.getByRole("tab", { name: "Read" }).click();
  const wikilink = brain
    .locator("button.cursor-pointer", { hasText: "North Star: Live by Default" })
    .first();
  await expect(wikilink).toBeVisible({ timeout: 15_000 });
  await wikilink.click();

  // The preview's wikilink opens the linked note in the same editor, and the
  // focused panel's URL snapshot is mirrored into the address bar.
  await expect(brain.getByPlaceholder("Untitled note")).toHaveValue(
    "North Star: Live by Default",
    { timeout: 15_000 },
  );
  await expect.poll(() => page.url(), { timeout: 15_000 }).toContain("/brain?note=");
  const notes = await readTable<{ id: string; title: string }>(page, "notes");
  const target = notes.find((n) => n.title === "North Star: Live by Default");
  await expect.poll(() => page.url(), { timeout: 15_000 }).toContain(`note=${target!.id}`);
});

test(CONNECTIONS_TITLE, async ({ desktop }) => {
  const { page } = desktop;
  await navigateTo(page, "Brain");
  const brain = notesPanel(page);

  await brain.getByText("North Star: Live by Default", { exact: true }).first().click();
  await expect(brain.getByPlaceholder("Untitled note")).toHaveValue(
    "North Star: Live by Default",
    { timeout: 15_000 },
  );

  // The entity Connections section lists the real wikilink edge as a live
  // chip ("Note Dashboard UX" = kind label + title).
  const section = brain.getByRole("region", { name: "Connections" });
  await expect(section.getByText("Linked from (1)")).toBeVisible({ timeout: 15_000 });
  const chip = section.getByRole("button", { name: /^Note Dashboard UX/ });
  await expect(chip).toBeVisible();

  // The Obsidian-style pane shows the same edge as a linked mention; its
  // toggle names the count ("Connections 1"), and the mention button's
  // accessible name is the note title plus its excerpt.
  const toggle = brain.getByRole("button", { name: /^Connections 1/ });
  await expect(toggle).toBeVisible({ timeout: 15_000 });
  const pane = toggle.locator("..");
  await expect(pane.getByText("Linked mentions")).toBeVisible();
  const mention = pane.getByRole("button", { name: /^Dashboard UX\b/ });
  await expect(mention).toBeVisible();

  // Clicking the mention opens that note.
  await mention.click();
  await expect(brain.getByPlaceholder("Untitled note")).toHaveValue("Dashboard UX", {
    timeout: 15_000,
  });
});

test(RELOAD_TITLE, async ({ desktop }) => {
  const { page } = desktop;
  await navigateTo(page, "Brain");
  const brain = notesPanel(page);

  // Create a note; its id rides in the app URL and in the dock's panel
  // snapshot (params — not the data-dock-url attribute, which stays "/brain").
  const title = `P9 reload note ${Date.now()}`;
  await brain.getByRole("button", { name: "New note" }).first().click();
  await brain.getByPlaceholder("Untitled note").fill(title);
  await expect.poll(() => page.url(), { timeout: 15_000 }).toContain("/brain?note=");
  const noteId = /note=([^&]+)/.exec(page.url())?.[1];
  expect(noteId).toBeTruthy();

  // Wait for the autosave to land before reloading: the list item shows the
  // saved title only once the note row carries it.
  await expect(brain.locator("button", { hasText: title }).first()).toBeVisible({
    timeout: 15_000,
  });

  // Focus away: the app URL now belongs to the dashboard, and the note id
  // survives only in the dock's persisted per-panel URL snapshot.
  await navigateTo(page, "Dashboard");
  await expect(page.getByTestId("shell-ready")).toBeVisible();

  await page.reload();
  await page.waitForSelector('[data-testid="app-shell"]', { timeout: 120_000 });
  await waitForShellReady(page);

  // The dock restored the Brain panel: its persisted panel URL must bring the
  // note back (before P9 the editor said "No note selected" here).
  await expect(brain.getByPlaceholder("Untitled note")).toHaveValue(title, { timeout: 20_000 });
  await expect(brain.getByText("No note selected")).toHaveCount(0);

  // Focusing the panel mirrors the snapshot back into the address bar.
  await navigateTo(page, "Brain");
  await expect.poll(() => page.url(), { timeout: 15_000 }).toContain(`note=${noteId!}`);
  await expect(brain.getByPlaceholder("Untitled note")).toHaveValue(title);
});

test(GRAPH_TITLE, async ({ desktop }) => {
  const { page } = desktop;
  // The Brain children (Graph/Templates) only render in the Capture popup
  // while a /brain route is active, so focus Brain first.
  await navigateTo(page, "Brain");
  await navigateTo(page, "Graph");
  const graph = page.locator('[data-testid="dock-panel"][data-dock-url^="/brain/graph"]');
  await expect(graph.locator("svg").first()).toBeVisible({ timeout: 20_000 });

  // The seeded notes render as nodes (labels are the note titles).
  const node = graph.locator("svg g.cursor-pointer").filter({ hasText: "Dashboard UX" }).first();
  await expect(node).toBeVisible({ timeout: 20_000 });
  await node.locator("circle").first().click();

  // Selecting a node opens its detail card; "Open in editor" focuses the note
  // in the Brain panel.
  const detail = graph.getByText("Dashboard UX", { exact: true }).last();
  await expect(detail).toBeVisible();
  await graph.getByRole("button", { name: "Open in editor" }).click();

  const brain = notesPanel(page);
  await expect(brain.getByPlaceholder("Untitled note")).toHaveValue("Dashboard UX", {
    timeout: 15_000,
  });
  await expect.poll(() => page.url(), { timeout: 15_000 }).toContain("/brain?note=");
});

test(TEMPLATES_TITLE, async ({ desktop }) => {
  const { page } = desktop;
  // Same as Graph: the child link lives in the Capture popup, active only on
  // a /brain route.
  await navigateTo(page, "Brain");
  await navigateTo(page, "Templates");
  const templates = page.locator('[data-testid="dock-panel"][data-dock-url^="/brain/templates"]');
  await expect(templates).toBeVisible({ timeout: 20_000 });

  const name = `P9 template ${Date.now()}`;
  await templates.getByRole("button", { name: "New template" }).first().click();
  const nameInput = templates.getByPlaceholder("Template name");
  await expect(nameInput).toBeVisible({ timeout: 15_000 });
  await nameInput.fill(name);

  // The list (live query) shows the saved template once the autosave lands.
  await expect(templates.getByText(name, { exact: true }).first()).toBeVisible({
    timeout: 15_000,
  });
  const rows = await readTable<{ id: string; name: string }>(page, "noteTemplates");
  expect(rows.filter((r) => r.name === name)).toHaveLength(1);
});

test(KNOWLEDGE_TITLE, async ({ desktop }) => {
  const { page } = desktop;
  await navigateTo(page, "Knowledge Graph");
  const graph = page.locator('[data-testid="dock-panel"][data-dock-url^="/knowledge"]');
  await expect(graph.locator("svg").first()).toBeVisible({ timeout: 20_000 });

  // Every category is on by default: the seeded SPEC-001 spec node is visible
  // next to the note nodes.
  const specNode = graph.locator("svg g.cursor-pointer").filter({ hasText: "SPEC-001" }).first();
  await expect(specNode).toBeVisible({ timeout: 20_000 });
  await specNode.locator("circle").first().click();

  await graph.getByRole("button", { name: "Open Spec" }).click();
  const specs = page.locator('[data-testid="dock-panel"][data-dock-url^="/specs"]');
  await expect(specs.getByPlaceholder("Spec title")).toHaveValue(
    "Realtime Presence & Deploy Streams",
    { timeout: 15_000 },
  );
  await expect.poll(() => page.url(), { timeout: 15_000 }).toContain("/specs?spec=");
});

test(SEARCH_TITLE, async ({ desktop }) => {
  const { page } = desktop;
  await navigateTo(page, "Semantic Search");
  const search = page.locator('[data-testid="dock-panel"][data-dock-url^="/search"]');
  const input = search.getByPlaceholder(/Search across/);
  await expect(input).toBeVisible({ timeout: 20_000 });

  await input.fill("North Star");
  // The result row is a button whose accessible name starts with the title
  // (the title itself is split into <mark> segments, so match by role/name).
  const hit = search.getByRole("button", { name: /^North Star: Live by Default/ }).first();
  await expect(hit).toBeVisible({ timeout: 20_000 });
  await hit.click();

  // The result opens the note in the Brain panel.
  const brain = notesPanel(page);
  await expect(brain.getByPlaceholder("Untitled note")).toHaveValue(
    "North Star: Live by Default",
    { timeout: 15_000 },
  );
  await expect.poll(() => page.url(), { timeout: 15_000 }).toContain("/brain?note=");
});
