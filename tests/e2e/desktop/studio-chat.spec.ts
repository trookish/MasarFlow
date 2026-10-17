import type { Page } from "@playwright/test";
import {
  test,
  expect,
  launchApp,
  navigateTo,
  addStubConnection,
  readTable,
} from "./_harness";
import { startStubProvider, stopAllStubs, waitFor } from "./_stub-provider";

/**
 * P9.T10 — studio + chat, end to end in the PACKAGED app.
 *
 * The two /chat tests run against a real loopback stub provider
 * (_stub-provider.ts): the app's own wire — ChatView → in-browser Agent Loop
 * → /api/chat → provider fetch — is exercised unchanged, and every claim
 * about what the app SENT is read back from the captured upstream payload
 * (the workspace briefing = snapshot v2 active context,
 * src/lib/ai/active-context.ts, plus the awareness tools).
 *
 * The five studio routes assert outcomes the app persisted — rows read back
 * from the app's own IndexedDB via the harness `readTable` — not just that a
 * page rendered.
 *
 * One worker (tests/playwright.desktop.config.ts): every test owns its app.
 */

const DEMO_THREAD = "Backpressure design review";
const DEMO_DOC = "Architecture Overview";
const STUB_LABEL = "E2E stub";
const STUB_MODEL = "stub-model";

/** The chat panel's container while /chat is focused. */
function chatPanel(page: Page) {
  return page.locator('[data-testid="dock-panel"][data-dock-url="/chat"]');
}

/** The composer textarea (agentic threads use the workspace placeholder). */
function composer(page: Page) {
  return chatPanel(page)
    .getByRole("textbox", { name: /Ask about|Message the model/ })
    .first();
}

test.afterAll(async () => {
  await stopAllStubs();
});

/** Opens the seeded Pulse thread and repoints it at the stub connection. */
async function openStubThread(page: Page): Promise<void> {
  await navigateTo(page, "Chat");
  await expect(chatPanel(page)).toHaveCount(1);
  await page.getByRole("button", { name: DEMO_THREAD, exact: true }).click();
  await expect(composer(page)).toBeVisible();
  await composer(page).fill(`/model ${STUB_LABEL}:${STUB_MODEL}`);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(`Now using ${STUB_LABEL}:${STUB_MODEL}`)).toBeVisible({
    timeout: 15_000,
  });
}

/**
 * Sends `text`, waits for the turn to start (Send swaps to Stop), then for it
 * to finish. The first send after ChatView mounts can be refused with "AI
 * providers are still loading" while the provider catalog resolves in the
 * background, so the whole sequence retries until the turn actually starts.
 */
async function sendTurn(page: Page, text: string): Promise<void> {
  const box = composer(page);
  const send = page.getByRole("button", { name: "Send" });
  await expect(async () => {
    await box.fill(text);
    await send.click();
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible({
      timeout: 2_000,
    });
  }).toPass({ timeout: 60_000 });
  // Turn finished: the composer swapped Stop back to Send.
  await expect(page.getByRole("button", { name: "Stop" })).toHaveCount(0, {
    timeout: 30_000,
  });
}

test("/chat: chat knows the open page", async () => {
  test.setTimeout(240_000);
  const stub = await startStubProvider();
  const app = await launchApp({ seed: "demo" });
  const { page } = app;
  try {
    // The catalog resolves in the background on the first AI page; arm the
    // waiter before any navigation so a send can never race it.
    const catalogSettled = page
      .waitForResponse((r) => r.url().includes("/api/ollama/models"), {
        timeout: 90_000,
      })
      .catch(() => null);

    await addStubConnection(page, stub.baseUrl, STUB_LABEL);

    // Leave a real entity open in the dock. The Docs editor is inline (no
    // modal), so its panel — and its ?doc= param — stays docked when chat
    // takes focus next: exactly the state the briefing must reflect.
    await navigateTo(page, "Documentation");
    await page.getByRole("button", { name: DEMO_DOC, exact: true }).first().click();
    await expect(page.getByPlaceholder("Untitled doc")).toHaveValue(DEMO_DOC);

    await openStubThread(page);
    await catalogSettled;
    await sendTurn(page, "what am I looking at?");

    // The reply came through the real wire.
    await expect(page.getByText(/STUB-REPLY what am I looking at\?/).first()).toBeVisible(
      { timeout: 30_000 },
    );

    // What the app actually SENT — the payload captured at the stub.
    await waitFor(() => stub.chatBodies().length > 0);
    const body = stub.chatBodies().at(-1)!;
    const sent = JSON.stringify(body);
    expect(body.model).toBe(STUB_MODEL);
    // Snapshot v2 active context: the open page is described by name.
    expect(sent).toContain("## Currently open");
    expect(sent).toContain(`Doc "${DEMO_DOC}"`);
    // The awareness tools travel with the turn.
    const tools = (body.tools ?? []) as { function?: { name?: string } }[];
    const names = tools.map((t) => t.function?.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "get_active_context",
        "open_entity",
        "get_backlinks",
        "list_activity",
        "git_status",
      ]),
    );
  } finally {
    await app.close();
    await stub.stop();
  }
});

test("/chat: create task from message", async () => {
  test.setTimeout(240_000);
  const stub = await startStubProvider();
  const app = await launchApp({ seed: "demo" });
  const { page } = app;
  try {
    await addStubConnection(page, stub.baseUrl, STUB_LABEL);
    await openStubThread(page);
    await sendTurn(page, "refactor the auth module");

    const reply = page.getByText(/STUB-REPLY refactor the auth module/).first();
    await expect(reply).toBeVisible({ timeout: 30_000 });

    // The hover actions are opacity-gated until the message row is hovered.
    await reply.hover();
    await page
      .getByRole("button", { name: "Create task from this message" })
      .first()
      .click();

    // The app opened the new task in the Task Boards panel (openEntity).
    const detail = page.getByRole("dialog");
    await expect(detail.getByPlaceholder("Task title")).toHaveValue(
      /refactor the auth module/,
    );

    // ...and it is a real row in the app's own database.
    await expect
      .poll(
        async () => {
          const tasks = await readTable<{ title: string }>(page, "tasks");
          return tasks.some((t) => t.title.includes("refactor the auth module"));
        },
        { timeout: 15_000 },
      )
      .toBe(true);
  } finally {
    await app.close();
    await stub.stop();
  }
});

test("/agents: roster seeds the default agents", async ({ desktop }) => {
  const { page } = desktop;
  await navigateTo(page, "AI Agents");
  await expect(
    page.locator('[data-testid="dock-panel"][data-dock-url="/agents"]'),
  ).toHaveCount(1);

  // ensureSeeded() runs on mount — the roster fills in from Dexie.
  const rows = page.getByTestId("agent-row");
  await expect(rows).toHaveCount(7, { timeout: 15_000 });

  // The roster is real data: the same agents are rows in the app's database.
  const agents = await readTable<{ id: string }>(page, "agents");
  const ids = agents.map((a) => a.id);
  for (const id of [
    "agent-architect",
    "agent-programmer",
    "agent-reviewer",
    "agent-tester",
    "agent-documenter",
    "agent-designer",
    "agent-optimizer",
  ]) {
    expect(ids).toContain(id);
  }
  await expect(rows.filter({ hasText: "Architect" }).first()).toBeVisible();
});

test("/architecture: create a system and open its diagram", async ({ desktop }) => {
  const { page } = desktop;
  await navigateTo(page, "Architecture");
  await expect(
    page.locator('[data-testid="dock-panel"][data-dock-url="/architecture"]'),
  ).toHaveCount(1);

  await page.getByRole("button", { name: "New system" }).first().click();
  const name = page.getByPlaceholder("System name");
  await expect(name).toHaveValue("Untitled system");
  await name.fill("P9 system");

  // The editor autosaves (450 ms debounce): assert the row, not the input.
  await expect
    .poll(
      async () => {
        const systems = await readTable<{ name: string }>(page, "systems");
        return systems.some((s) => s.name === "P9 system");
      },
      { timeout: 15_000 },
    )
    .toBe(true);

  // The diagram tab renders the new system as a node.
  await page.getByRole("tab", { name: "Diagram" }).click();
  await expect(page.locator(".react-flow").getByText("P9 system")).toBeVisible({
    timeout: 15_000,
  });
});

test("/brain/canvas: add a card to the canvas", async ({ desktop }) => {
  const { page } = desktop;
  // Canvas is a child of Brain in the dock's Capture group; open Brain first
  // so the group popup lists its children (sidebar.tsx GroupItems).
  await navigateTo(page, "Brain");
  await navigateTo(page, "Canvas");
  await expect(
    page.locator('[data-testid="dock-panel"][data-dock-url="/brain/canvas"]'),
  ).toHaveCount(1);

  await page.getByTestId("canvas-add-link").click();
  await page.getByPlaceholder("https://example.com").fill("https://example.com");
  await page.getByRole("button", { name: "Add", exact: true }).click();

  // Persisted as a real canvas node...
  await expect
    .poll(
      async () => {
        const nodes = await readTable<{ id: string; data?: { url?: string } }>(
          page,
          "canvasNodes",
        );
        return nodes.some((n) => n.data?.url === "https://example.com");
      },
      { timeout: 15_000 },
    )
    .toBe(true);
  const nodes = await readTable<{ id: string; data?: { url?: string } }>(
    page,
    "canvasNodes",
  );
  const node = nodes.find((n) => n.data?.url === "https://example.com")!;

  // ...and rendered as a card in the flow.
  await expect(page.locator(`.react-flow__node[data-id="${node.id}"]`)).toBeVisible({
    timeout: 15_000,
  });
});

test("/docs: create a document", async ({ desktop }) => {
  const { page } = desktop;
  await navigateTo(page, "Documentation");
  await expect(page.locator('[data-testid="dock-panel"][data-dock-url="/docs"]')).toHaveCount(
    1,
  );

  await page.getByRole("button", { name: "New doc" }).first().click();
  const title = page.getByPlaceholder("Untitled doc");
  await expect(title).toHaveValue("Untitled doc");
  await title.fill("P9 doc");

  // Autosave (450 ms debounce) → the doc is a real row...
  await expect
    .poll(
      async () => {
        const docs = await readTable<{ title: string }>(page, "docs");
        return docs.some((d) => d.title === "P9 doc");
      },
      { timeout: 15_000 },
    )
    .toBe(true);

  // ...and the sidebar (a live query over the same table) lists it.
  await expect(page.getByRole("button", { name: "P9 doc", exact: true })).toBeVisible({
    timeout: 15_000,
  });
});

test("/watcher: watch events view renders", async ({ desktop }) => {
  const { page } = desktop;
  await navigateTo(page, "Project Watcher");
  await expect(
    page.locator('[data-testid="dock-panel"][data-dock-url="/watcher"]'),
  ).toHaveCount(1);

  // The seeded Pulse events are real rows from the app's DB, rendered by the
  // view: count, paths, and the Watch/Clear controls all come from that state.
  await expect(page.getByText("3 events")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("src/realtime/backpressure.ts")).toBeVisible();
  await expect(page.getByRole("button", { name: "Watch", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Clear", exact: true })).toBeVisible();

  const events = await readTable<{ path: string }>(page, "watchEvents");
  expect(events.map((e) => e.path)).toEqual(
    expect.arrayContaining([
      "src/realtime/backpressure.ts",
      "src/gateway/webhooks.ts",
      "web/package.json",
    ]),
  );
});
