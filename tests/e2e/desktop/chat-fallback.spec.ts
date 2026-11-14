/**
 * Provider fallback and the `/model` command on the PACKAGED app.
 *
 * Two saved connections ("Primary", "Backup") point at one loopback stub
 * provider (_stub-provider.ts). The stub answers 429 for `primary-model`, so a
 * turn on a thread whose fallback chain is [Primary → Backup] must retry,
 * switch to Backup, stream its reply and offer "Keep using this model". The
 * whole wire is real: ChatView → /api/chat in the embedded server → the stub.
 */
import { test as base, type Locator, type Page } from "@playwright/test";
import {
  expect,
  addStubConnection,
  launchApp,
  navigateTo,
  readTable,
  surfacePanel,
  type AppHandle,
} from "./_harness";
import { startStubProvider, stopAllStubs, type StubProvider } from "./_stub-provider";

const THREAD_ID = "thread-e2e-fallback";
const THREAD_TITLE = "Provider fallback";

interface Ctx {
  app: AppHandle;
  stub: StubProvider;
}

const test = base.extend<{ chat: Ctx }>({
  chat: async ({}, provide) => {
    const stub = await startStubProvider({ rateLimited: ["primary-model"] });
    const app = await launchApp({ seed: "project" });
    try {
      await addStubConnection(app.page, stub.baseUrl, "Primary");
      await addStubConnection(app.page, stub.baseUrl, "Backup");
      await seedThread(app.page);
      await provide({ app, stub });
    } finally {
      await app.close();
      await stub.stop();
    }
  },
});

test.afterAll(async () => {
  await stopAllStubs();
});

/** Writes a chat-mode thread with the fallback chain [Primary → Backup]. */
async function seedThread(page: Page): Promise<void> {
  await expect
    .poll(async () => (await readTable<{ label: string }>(page, "aiConnections")).map((c) => c.label).sort())
    .toEqual(["Backup", "Primary"]);
  await page.evaluate(
    async ({ id, title }) => {
      const db: IDBDatabase = await new Promise((resolve, reject) => {
        const req = indexedDB.open("masarflow");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const all = <T,>(store: string) =>
        new Promise<T[]>((resolve, reject) => {
          const g = db.transaction(store, "readonly").objectStore(store).getAll();
          g.onsuccess = () => resolve(g.result as T[]);
          g.onerror = () => reject(g.error);
        });
      const conns = await all<{ id: string; label: string }>("aiConnections");
      const projects = await all<{ id: string }>("projects");
      const byLabel = (l: string) => conns.find((c) => c.label === l)!.id;
      const now = Date.now();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("chatThreads", "readwrite");
        tx.objectStore("chatThreads").put({
          id,
          projectId: projects[0].id,
          title,
          connectionId: byLabel("Primary"),
          modelId: "primary-model",
          backend: "api",
          mode: "chat",
          reasoningEnabled: false,
          effort: "off",
          fallbacks: [{ connectionId: byLabel("Backup"), modelId: "backup-model" }],
          createdAt: now,
          updatedAt: now,
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { id: THREAD_ID, title: THREAD_TITLE },
  );
}

/** Opens the seeded thread from the Chat thread list; returns its composer. */
async function openThread(page: Page): Promise<Locator> {
  await navigateTo(page, "Chat");
  const panel = surfacePanel(page, "Chat");
  const row = panel.getByRole("button", { name: THREAD_TITLE, exact: true });
  const toggle = panel.getByRole("button", { name: "Show conversations" });
  if (await toggle.isVisible()) await toggle.click();
  await row.click();
  // Mode "chat": this placeholder appears only once the seeded thread is loaded.
  const composer = panel.getByPlaceholder("Message the model directly…");
  await expect(composer).toBeVisible({ timeout: 30_000 });
  return composer;
}

/**
 * Presses Enter until the send path runs: the chat refuses a turn while the
 * provider catalog is still loading and keeps the text, so a cleared composer
 * means the turn (or the `/model` switch) went through.
 */
async function send(composer: Locator, text: string): Promise<void> {
  await composer.fill(text);
  await expect(async () => {
    await composer.press("Enter");
    await expect(composer).toHaveValue("", { timeout: 2_000 });
  }).toPass({ timeout: 30_000, intervals: [300, 600, 1_200] });
}

async function readThread(page: Page) {
  const rows = await readTable<{ id: string; connectionId: string; modelId: string }>(page, "chatThreads");
  return rows.find((t) => t.id === THREAD_ID);
}

const modelsAsked = (stub: StubProvider) => stub.chatBodies().map((b) => String(b.model ?? ""));

test("/chat: falls back to the next connection after repeated 429s", async ({ chat }) => {
  const { app, stub } = chat;
  const panel = surfacePanel(app.page, "Chat");
  await send(await openThread(app.page), "ping");

  await expect(panel.getByText(/Switched to Backup:backup-model/).first()).toBeVisible({ timeout: 60_000 });
  await expect(panel.getByText("STUB-REPLY ping").first()).toBeVisible({ timeout: 30_000 });
  // Primary was retried before the switch; Backup answered last.
  expect(modelsAsked(stub).filter((m) => m === "primary-model").length).toBeGreaterThanOrEqual(2);
  expect(modelsAsked(stub).at(-1)).toBe("backup-model");
});

test("/chat: keep using this model repoints the thread at the fallback", async ({ chat }) => {
  const { app } = chat;
  const page = app.page;
  const panel = surfacePanel(page, "Chat");
  const primaryId = (await readThread(page))?.connectionId;
  await send(await openThread(page), "ping");

  // The notice offers the switch; the thread itself is untouched so far.
  const keep = panel.getByRole("button", { name: "Keep using this model" });
  await expect(keep).toBeVisible({ timeout: 60_000 });
  expect((await readThread(page))?.connectionId).toBe(primaryId);

  await keep.click();
  await expect(panel.getByText("Now using Backup:backup-model").first()).toBeVisible();
  await expect.poll(async () => (await readThread(page))?.modelId, { timeout: 10_000 }).toBe("backup-model");
  expect((await readThread(page))?.connectionId).not.toBe(primaryId);
});

test("/chat: the model command switches connection and model with no network call", async ({ chat }) => {
  const { app, stub } = chat;
  const page = app.page;
  const before = stub.chatBodies().length;
  const composer = await openThread(page);
  await send(composer, "/model Backup:fast-model");

  await expect(surfacePanel(page, "Chat").getByText("Now using Backup:fast-model").first()).toBeVisible();
  await expect(composer).toHaveValue("");
  // The command never reached the provider…
  expect(stub.chatBodies().length).toBe(before);
  // …and the thread now points at Backup:fast-model.
  await expect.poll(async () => (await readThread(page))?.modelId).toBe("fast-model");
});
