import type { Page } from "@playwright/test";
import {
  test,
  expect,
  launchApp,
  navigateTo,
  surfacePanel,
  addStubConnection,
  readTable,
} from "./_harness";
import { startStubProvider, stopAllStubs, waitFor } from "./_stub-provider";

/**
 * Stream C: grouped tool calls, the Verbose / Normal / Summary view modes and
 * side chats, end to end in the PACKAGED app against the loopback stub
 * provider. `STUB-TOOLS ok|fail <text>` (see _stub-provider.ts) makes the
 * stub ask for real read-only tool calls, which the in-browser Agent Loop
 * executes; the persisted toolActivity is read back from IndexedDB.
 */

const DEMO_THREAD = "Backpressure design review";
const STUB_LABEL = "E2E stub";
const STUB_MODEL = "stub-model";

test.afterAll(async () => {
  await stopAllStubs();
});

function chatPanel(page: Page) {
  return surfacePanel(page, "Chat");
}

function composer(page: Page) {
  return chatPanel(page)
    .getByRole("textbox", { name: /Ask about|Message the model/ })
    .first();
}

async function openStubThread(page: Page): Promise<void> {
  await navigateTo(page, "Chat");
  await expect(chatPanel(page)).toHaveCount(1);
  const row = chatPanel(page).getByRole("button", {
    name: DEMO_THREAD,
    exact: true,
  });
  const toggle = chatPanel(page).getByRole("button", {
    name: "Show conversations",
  });
  if (await toggle.isVisible()) await toggle.click();
  await row.click();
  await expect(composer(page)).toBeVisible();
  await composer(page).fill(`/model ${STUB_LABEL}:${STUB_MODEL}`);
  await chatPanel(page).getByRole("button", { name: "Send" }).click();
  await expect(
    chatPanel(page).getByText(`Now using ${STUB_LABEL}:${STUB_MODEL}`),
  ).toBeVisible({ timeout: 15_000 });
}

/** Sends `text` and waits for the turn to finish (Stop swaps back to Send). */
async function sendTurn(page: Page, text: string): Promise<void> {
  const send = chatPanel(page).getByRole("button", { name: "Send" });
  const stop = chatPanel(page).getByRole("button", { name: "Stop" });
  await expect(async () => {
    await composer(page).fill(text);
    await send.click();
    await expect(stop).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
  await expect(stop).toHaveCount(0, { timeout: 30_000 });
}

interface StoredMessage {
  id: string;
  threadId: string;
  role: string;
  content: string;
  createdAt: number;
  toolActivity: {
    name: string;
    ok: boolean;
    arguments?: Record<string, unknown>;
    result?: string;
  }[];
}

async function messagesOf(page: Page, threadId: string) {
  const all = await readTable<StoredMessage>(page, "chatMessages");
  return all
    .filter((m) => m.threadId === threadId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

async function activeThreadId(page: Page): Promise<string> {
  const id = await page.evaluate(() =>
    new URL(window.location.href).searchParams.get("thread"),
  );
  expect(id).toBeTruthy();
  return id as string;
}

function toolView(page: Page, label: "Verbose" | "Normal" | "Summary") {
  return chatPanel(page).getByRole("radio", {
    name: `${label} tool call view`,
  });
}

test("/chat: grouped tool calls collapse and expand", async () => {
  test.setTimeout(240_000);
  const stub = await startStubProvider();
  const app = await launchApp({ seed: "demo" });
  const { page } = app;
  try {
    await addStubConnection(page, stub.baseUrl, STUB_LABEL);
    await openStubThread(page);
    await sendTurn(page, "STUB-TOOLS ok read the board");
    await expect(
      chatPanel(page).getByText(/STUB-REPLY STUB-TOOLS ok read the board/),
    ).toBeVisible({ timeout: 30_000 });

    // The turn's tool calls were stored with their arguments and results.
    const threadId = await activeThreadId(page);
    await expect(async () => {
      const assistant = (await messagesOf(page, threadId)).filter(
        (m) => m.role === "assistant" && m.toolActivity.length > 0,
      );
      expect(assistant).toHaveLength(1);
      const calls = assistant[0].toolActivity;
      expect(calls).toHaveLength(2);
      expect(calls.every((c) => c.ok)).toBe(true);
      expect(calls.every((c) => c.arguments && c.result)).toBe(true);
    }).toPass({ timeout: 15_000 });

    // Normal mode: one collapsed group with a one-line summary.
    const group = chatPanel(page).getByTestId("tool-call-group");
    await expect(group).toHaveCount(1);
    const header = group.getByRole("button", { expanded: false }).first();
    await expect(header).toBeVisible();
    await expect(group.getByTestId("tool-group-summary")).toHaveText(
      /^2 tool calls: \S+, \S+$/,
    );
    await expect(group.getByTestId("tool-call")).toHaveCount(0);

    // Click expands: both calls show a name and an OK status.
    await header.click();
    await expect(group.getByTestId("tool-call")).toHaveCount(2);
    await expect(group.locator('[data-status="ok"]')).toHaveCount(2);

    // A call expands further to its arguments and result.
    await group.getByTestId("tool-call").nth(1).getByRole("button").click();
    await expect(group.getByText("Arguments")).toBeVisible();
    await expect(group.getByText("Result", { exact: true })).toBeVisible();
    await expect(group.getByText(/"query": "Pulse"/)).toBeVisible();

    // Keyboard: Enter collapses, Space expands again.
    const toggle = group.getByTestId("tool-group-summary").locator("..");
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(group.getByTestId("tool-call")).toHaveCount(0);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Space");
    await expect(group.getByTestId("tool-call")).toHaveCount(2);
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
  } finally {
    await app.close();
    await stub.stop();
  }
});

test("/chat: view modes change how tool calls render", async () => {
  test.setTimeout(300_000);
  const stub = await startStubProvider();
  const app = await launchApp({ seed: "demo" });
  const { page } = app;
  try {
    await addStubConnection(page, stub.baseUrl, STUB_LABEL);
    await openStubThread(page);
    await sendTurn(page, "STUB-TOOLS ok first turn");
    await sendTurn(page, "STUB-TOOLS fail second turn");
    await expect(
      chatPanel(page).getByText(/STUB-REPLY STUB-TOOLS fail second turn/),
    ).toBeVisible({ timeout: 30_000 });

    const groups = chatPanel(page).getByTestId("tool-call-group");
    await expect(groups).toHaveCount(2);

    // Normal (the default): the clean group is collapsed, the group with a
    // failed call is open and marks the failure.
    await expect(toolView(page, "Normal")).toBeChecked();
    await expect(groups.nth(0)).toHaveAttribute("data-open", "false");
    await expect(groups.nth(1)).toHaveAttribute("data-open", "true");
    await expect(groups.nth(1).locator('[data-status="failed"]')).toHaveCount(1);
    await expect(groups.nth(1).getByTestId("tool-group-summary")).toContainText(
      "1 failed",
    );

    // Verbose: every group is open.
    await toolView(page, "Verbose").click();
    await expect(toolView(page, "Verbose")).toBeChecked();
    await expect(groups.nth(0)).toHaveAttribute("data-open", "true");
    await expect(groups.nth(1)).toHaveAttribute("data-open", "true");
    await expect(groups.nth(0).getByTestId("tool-call")).toHaveCount(2);

    // Summary: no groups, a count chip per tool turn, reply text intact.
    await toolView(page, "Summary").click();
    await expect(groups).toHaveCount(0);
    const chips = chatPanel(page).getByTestId("tool-count-chip");
    await expect(chips).toHaveCount(2);
    await expect(chips.nth(0)).toHaveText("2 tool calls");
    await expect(chips.nth(1)).toHaveText("3 tool calls, 1 failed");
    await expect(
      chatPanel(page).getByText(/STUB-REPLY STUB-TOOLS ok first turn/),
    ).toBeVisible();

    // The choice survives a reload.
    await page.reload();
    await expect(composer(page)).toBeVisible({ timeout: 30_000 });
    await expect(toolView(page, "Summary")).toBeChecked();
    await expect(chatPanel(page).getByTestId("tool-count-chip")).toHaveCount(2);
    await toolView(page, "Normal").click();
    await expect(chatPanel(page).getByTestId("tool-call-group")).toHaveCount(2);
  } finally {
    await app.close();
    await stub.stop();
  }
});

test("/chat: side chat does not change the main thread", async () => {
  test.setTimeout(300_000);
  const stub = await startStubProvider();
  const app = await launchApp({ seed: "demo" });
  const { page } = app;
  try {
    await addStubConnection(page, stub.baseUrl, STUB_LABEL);
    await openStubThread(page);
    await sendTurn(page, "main question one");
    await expect(
      chatPanel(page).getByText(/STUB-REPLY main question one/),
    ).toBeVisible({ timeout: 30_000 });

    const mainId = await activeThreadId(page);
    const before = await messagesOf(page, mainId);
    const beforeShape = before.map((m) => `${m.id}:${m.role}:${m.content}`);

    // Branch at the assistant reply.
    const reply = chatPanel(page)
      .getByText(/STUB-REPLY main question one/)
      .first();
    await reply.hover();
    await chatPanel(page)
      .getByRole("button", { name: "Start a side chat from this message" })
      .last()
      .click();
    const banner = chatPanel(page).getByTestId("side-chat-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Messages here never appear");
    await expect(
      banner.getByRole("button", { name: /Return to main thread/ }),
    ).toBeVisible();

    // The side chat shares the main context: it is sent to the model.
    await sendTurn(page, "side question only");
    await expect(
      chatPanel(page).getByText(/STUB-REPLY side question only/),
    ).toBeVisible({ timeout: 30_000 });
    await waitFor(() => stub.chatBodies().length >= 2);
    const sent = (
      (stub.chatBodies().at(-1)!.messages ?? []) as {
        role?: string;
        content?: unknown;
      }[]
    )
      .map((m) => (typeof m.content === "string" ? m.content : ""))
      .join("\n");
    expect(sent).toContain("main question one");
    expect(sent).toContain("side question only");

    // The side chat has its own thread; the main thread did not change.
    const sideId = await activeThreadId(page);
    expect(sideId).not.toBe(mainId);
    const threads = await readTable<{ id: string; sideOf?: { threadId: string } }>(
      page,
      "chatThreads",
    );
    expect(threads.find((t) => t.id === sideId)?.sideOf?.threadId).toBe(mainId);
    const mid = (await messagesOf(page, mainId)).map(
      (m) => `${m.id}:${m.role}:${m.content}`,
    );
    expect(mid).toEqual(beforeShape);

    // Return to the main thread: same messages in the same order, and the
    // side question is nowhere in it.
    await banner.getByRole("button", { name: /Return to main thread/ }).click();
    await expect(banner).toHaveCount(0);
    await expect(composer(page)).toBeVisible();
    expect(await activeThreadId(page)).toBe(mainId);
    await expect(
      chatPanel(page).getByText(/STUB-REPLY main question one/).first(),
    ).toBeVisible();
    await expect(chatPanel(page).getByText(/side question only/)).toHaveCount(0);
    const after = (await messagesOf(page, mainId)).map(
      (m) => `${m.id}:${m.role}:${m.content}`,
    );
    expect(after).toEqual(beforeShape);

    // The branch point now opens the existing side chat instead of a new one.
    await chatPanel(page)
      .getByText(/STUB-REPLY main question one/)
      .first()
      .hover();
    await chatPanel(page)
      .getByRole("button", { name: /Open the side chat branched/ })
      .last()
      .click();
    await expect(banner).toBeVisible();
    expect(await activeThreadId(page)).toBe(sideId);
    await expect(
      chatPanel(page).getByText(/STUB-REPLY side question only/),
    ).toBeVisible();
    const sideThreads = (
      await readTable<{ id: string; sideOf?: unknown }>(page, "chatThreads")
    ).filter((t) => t.sideOf);
    expect(sideThreads).toHaveLength(1);
  } finally {
    await app.close();
    await stub.stop();
  }
});
