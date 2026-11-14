import type { Page } from "@playwright/test";
import {
  test,
  expect,
  launchApp,
  navigateTo,
  focusTab,
  surfacePanel,
  setWindowContentSize,
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
 * Navigation is the 0.2 shell: six surfaces, one tab each. /chat lives in the
 * Ask tab, /docs and /architecture in Library, /agents in Ask, /brain/canvas in
 * Capture, /watcher in System — while a *tab* stays open, its content (and its
 * ?doc= snapshot) survives focus moving to another tab, which is exactly the
 * state the workspace briefing must reflect.
 *
 * One worker (tests/playwright.desktop.config.ts): every test owns its app.
 */

const DEMO_THREAD = "Backpressure design review";
const DEMO_DOC = "Architecture Overview";
const DEMO_DOC2 = "Welcome to Pulse";
const STUB_LABEL = "E2E stub";
const STUB_MODEL = "stub-model";

/** The Ask surface's panel — the tab that hosts /chat. */
function chatPanel(page: Page) {
  return surfacePanel(page, "Chat");
}

/** The Library surface's panel — the tab that hosts /docs. */
function docsPanel(page: Page) {
  return surfacePanel(page, "Documentation");
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

/**
 * Selects the seeded Pulse thread. Below the chat view's 600 px breakpoint
 * the thread list sits behind the "Show conversations" toggle, so open it
 * first when the row is not on screen.
 */
async function pickThread(page: Page): Promise<void> {
  const row = chatPanel(page).getByRole("button", { name: DEMO_THREAD, exact: true });
  const toggle = chatPanel(page).getByRole("button", { name: "Show conversations" });
  if (await toggle.isVisible()) await toggle.click();
  await row.click();
  await expect(composer(page)).toBeVisible();
}

/** Opens the seeded Pulse thread and repoints it at the stub connection. */
async function openStubThread(page: Page): Promise<void> {
  await navigateTo(page, "Chat");
  await expect(chatPanel(page)).toHaveCount(1);
  await pickThread(page);
  await composer(page).fill(`/model ${STUB_LABEL}:${STUB_MODEL}`);
  await chatPanel(page).getByRole("button", { name: "Send" }).click();
  await expect(
    chatPanel(page).getByText(`Now using ${STUB_LABEL}:${STUB_MODEL}`),
  ).toBeVisible({ timeout: 15_000 });
}

/**
 * Sends `text`, waits for the turn to start (Send swaps to Stop), then for it
 * to finish. The first send after ChatView mounts can be refused with "AI
 * providers are still loading" while the provider catalog resolves in the
 * background, so the whole sequence retries until the turn actually starts.
 */
async function sendTurn(page: Page, text: string): Promise<void> {
  const box = composer(page);
  const send = chatPanel(page).getByRole("button", { name: "Send" });
  const stop = chatPanel(page).getByRole("button", { name: "Stop" });
  await expect(async () => {
    await box.fill(text);
    await send.click();
    await expect(stop).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
  // Turn finished: the composer swapped Stop back to Send.
  await expect(stop).toHaveCount(0, { timeout: 30_000 });
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

    // /chat first: select the seeded thread, repoint it at the stub, and
    // watch the /model notice land in the chat panel.
    await navigateTo(page, "Chat");
    await expect(chatPanel(page)).toHaveCount(1);
    await pickThread(page);
    await composer(page).fill(`/model ${STUB_LABEL}:${STUB_MODEL}`);
    await chatPanel(page).getByRole("button", { name: "Send" }).click();
    await expect(
      chatPanel(page).getByText(`Now using ${STUB_LABEL}:${STUB_MODEL}`),
    ).toBeVisible({ timeout: 15_000 });
    await catalogSettled;

    // Leave a real entity open in another tab. The Docs editor is inline (no
    // modal), so the Library tab — with its ?doc= snapshot — stays open with
    // that document selected: exactly the state the briefing must reflect
    // after the return to Ask.
    await navigateTo(page, "Documentation");
    await docsPanel(page)
      .getByRole("button", { name: DEMO_DOC, exact: true })
      .first()
      .click();
    await expect(docsPanel(page).getByPlaceholder("Untitled doc")).toHaveValue(
      DEMO_DOC,
    );

    // Back to the Ask tab and send. Clicking the tab keeps its ?thread=
    // snapshot (workspace-tabs.tsx focuses the tab and mirrors that URL back
    // into the address bar), so the thread is still the selected one.
    await focusTab(page, "Chat");
    await expect(composer(page)).toBeVisible();
    await sendTurn(page, "what am I looking at?");

    // The turn completed: the reply round-tripped through the stub, is
    // visible in the (narrow) chat panel, and is persisted.
    await expect(
      chatPanel(page).getByText(/STUB-REPLY what am I looking at/).first(),
    ).toBeVisible({ timeout: 30_000 });
    await expect(async () => {
      const messages = await readTable<{ role: string; content: string }>(
        page,
        "chatMessages",
      );
      expect(
        messages.some(
          (m) =>
            m.role === "assistant" &&
            m.content.includes("STUB-REPLY") &&
            m.content.includes("what am I looking at"),
        ),
      ).toBe(true);
    }).toPass({ timeout: 15_000 });

    // The real assertion — what the app actually SENT, captured at the stub.
    await waitFor(() => stub.chatBodies().length > 0);
    const body = stub.chatBodies().at(-1)!;
    expect(body.model).toBe(STUB_MODEL);
    // Snapshot v2 active context: the open page is described by name. Read
    // the briefing text itself — stringifying the body escapes the quotes,
    // so a `Doc "…"` substring would never match the JSON encoding.
    const briefing = (
      (body.messages ?? []) as { role?: string; content?: unknown }[]
    )
      .filter((m) => m.role === "system" && typeof m.content === "string")
      .map((m) => m.content as string)
      .join("\n");
    expect(briefing).toContain("## Currently open");
    expect(briefing).toContain(`Doc "${DEMO_DOC}"`);
    // The awareness tools travel with the turn. The model sees the coarse
    // toolset: workspace_context carries the active page, backlinks, git status
    // and open; list_entities carries activity.
    const tools = (body.tools ?? []) as {
      function?: { name?: string; description?: string; parameters?: unknown };
    }[];
    const names = tools.map((t) => t.function?.name);
    expect(names).toEqual(
      expect.arrayContaining(["workspace_context", "list_entities", "read_entity", "search_workspace"]),
    );
    const contextTool = JSON.stringify(tools.find((t) => t.function?.name === "workspace_context"));
    for (const kind of ["active", "backlinks", "git_status", "open"]) expect(contextTool).toContain(kind);
    expect(JSON.stringify(tools.find((t) => t.function?.name === "list_entities"))).toContain("activity");
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

    const reply = chatPanel(page)
      .getByText(/STUB-REPLY refactor the auth module/)
      .first();
    await expect(reply).toBeVisible({ timeout: 30_000 });

    // The hover actions are opacity-gated until the message row is hovered.
    // The reply is the LAST message — the seeded thread's earlier messages
    // also carry this button in the DOM, so take the last one, not the first.
    await reply.hover();
    await page
      .getByRole("button", { name: "Create task from this message" })
      .last()
      .click();

    // The app opened the new task in the Task Boards panel (openEntity).
    const detail = page.getByTestId("task-editor");
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

test("/chat: the conversation stays usable at the narrowest supported window", async () => {
  test.setTimeout(240_000);
  const stub = await startStubProvider();
  const app = await launchApp({ seed: "demo" });
  const { page } = app;
  try {
    await addStubConnection(page, stub.baseUrl, STUB_LABEL);
    await navigateTo(page, "Chat");
    await expect(chatPanel(page)).toHaveCount(1);

    // The 0.2 shell has no split panes: a surface is as narrow as the window
    // allows, and the smallest window the app accepts is 1000x640
    // (desktop/src/main/windows/main-window.ts). Shrink to it and measure what
    // a user on a small screen actually gets.
    const size = await setWindowContentSize(app.app, 1000, 700);
    expect(size.width).toBeLessThanOrEqual(1000);
    const panelBox = await chatPanel(page).boundingBox();
    expect(panelBox?.width ?? 0).toBeLessThan(900);
    expect(panelBox?.width ?? 0).toBeGreaterThanOrEqual(300);

    // The bug this guards: the fixed w-64 thread list starved the conversation
    // column (flex-1 min-w-0) to a sliver.
    const column = chatPanel(page).locator("div.min-w-0.flex-1.flex-col").first();
    const columnBox = await column.boundingBox();
    console.log(`[min window chat] panel=${panelBox?.width} column=${columnBox?.width}`);
    expect(columnBox?.width ?? 0).toBeGreaterThanOrEqual(280);

    // Above the view's 600 px breakpoint the thread list is docked beside the
    // conversation: no overlay toggle, and choosing a thread leaves the column.
    await expect(
      chatPanel(page).getByRole("button", { name: "Show conversations" }),
    ).toHaveCount(0);
    const row = chatPanel(page).getByRole("button", { name: DEMO_THREAD, exact: true });
    await expect(row).toBeVisible();
    await row.click();
    await expect(composer(page)).toBeVisible();
    const composerBox = await composer(page).boundingBox();
    console.log(`[min window chat] composer=${composerBox?.width}`);
    // The textarea shares its row with the attach/voice/send buttons, so it is
    // measured against its conversation column (the thread list is docked
    // beside it at this width): it was ~12 px before the fix.
    const liveColumn = (await column.boundingBox())?.width ?? 0;
    expect(composerBox?.width ?? 0).toBeGreaterThanOrEqual(liveColumn * 0.6);
    expect(composerBox?.width ?? 0).toBeGreaterThanOrEqual(280);

    // Still a working chat at that width: repoint the thread at the stub, send,
    // and the reply is VISIBLE in the window (not only persisted).
    await composer(page).fill(`/model ${STUB_LABEL}:${STUB_MODEL}`);
    await chatPanel(page).getByRole("button", { name: "Send" }).click();
    await expect(
      chatPanel(page).getByText(`Now using ${STUB_LABEL}:${STUB_MODEL}`),
    ).toBeVisible({ timeout: 15_000 });
    await sendTurn(page, "status of the narrow window");
    await expect(
      chatPanel(page).getByText(/STUB-REPLY status of the narrow window/).first(),
    ).toBeVisible({ timeout: 30_000 });
  } finally {
    await app.close();
    await stub.stop();
  }
});

test("/agents: roster seeds the default agents", async ({ desktop }) => {
  const { page } = desktop;
  await navigateTo(page, "AI Agents");
  await expect(surfacePanel(page, "AI Agents")).toHaveCount(1);

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
  await expect(surfacePanel(page, "Architecture")).toHaveCount(1);

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
  // Canvas is the second section of the Capture surface — the section tab bar
  // is always visible, so no group has to be opened first.
  await navigateTo(page, "Canvas");
  await expect(surfacePanel(page, "Canvas")).toHaveCount(1);

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
  await expect(surfacePanel(page, "Documentation")).toHaveCount(1);

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

test("/docs: the editor stays usable at the narrowest supported window", async ({ desktop }) => {
  const { page, app } = desktop;

  // Two tabs open: Library (with a doc selected) and the System tab, so the
  // docs tab has to keep its ?doc= snapshot while it is not focused.
  await navigateTo(page, "Chat");
  await navigateTo(page, "Documentation");
  await docsPanel(page)
    .getByRole("button", { name: DEMO_DOC, exact: true })
    .first()
    .click();
  await expect(docsPanel(page).getByPlaceholder("Untitled doc")).toHaveValue(
    DEMO_DOC,
  );

  await navigateTo(page, "Project Watcher");
  await expect(surfacePanel(page, "Project Watcher")).toHaveCount(1);

  // Shrink to the smallest window the app accepts (1000x640 min), then come
  // back to the docs tab: the snapshot survived the loss of focus.
  await setWindowContentSize(app, 1000, 700);
  await focusTab(page, "Documentation");
  await expect(docsPanel(page).getByPlaceholder("Untitled doc")).toHaveValue(
    DEMO_DOC,
  );

  const panel = await docsPanel(page).boundingBox();
  expect(panel?.width ?? 0).toBeLessThan(900);

  // The bug this guards: the fixed-width doc list (w-72) starves the editor
  // column (flex-1 min-w-0) down to 0 px — in the DOM, but unusable.
  const editor = docsPanel(page).locator("div.min-w-0.flex-1").first();
  const editorBox = await editor.boundingBox();
  expect(editorBox?.width ?? 0).toBeGreaterThanOrEqual(280);

  // Above the panel-width threshold the list stays docked (no collapse
  // toggle), and another doc is still one click away.
  await expect(
    docsPanel(page).getByRole("button", { name: "Show docs list" }),
  ).toHaveCount(0);
  const other = docsPanel(page).getByRole("button", {
    name: DEMO_DOC2,
    exact: true,
  });
  await expect(other).toBeVisible();
  await other.click();
  await expect(docsPanel(page).getByPlaceholder("Untitled doc")).toHaveValue(
    DEMO_DOC2,
  );
});

test("/watcher: watch events view renders", async ({ desktop }) => {
  const { page } = desktop;
  await navigateTo(page, "Project Watcher");
  await expect(surfacePanel(page, "Project Watcher")).toHaveCount(1);

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
