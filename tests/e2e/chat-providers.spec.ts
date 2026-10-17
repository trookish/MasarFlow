import { test, expect, type Locator, type Page } from "@playwright/test";

/**
 * Provider fallback + the `/model` command, end to end (P1b.T15).
 *
 * Everything the chat needs is local (IndexedDB connections + thread), so the
 * only non-local boundary is /api/chat itself — mocked here. The thread's own
 * connection ("Primary") always answers 429; after one retry the client must
 * switch to the saved fallback ("Backup"), stream its reply and write a
 * "Switched to …" notice with a "Keep using this model" offer.
 *
 * Proved end to end here:
 *  1. repeated 429s → retry once → switch to Backup → notice + reply shown;
 *  2. "Keep using this model" repoints the thread at Backup (before: unchanged);
 *  3. `/model Backup:fast-model` switches without any /api/chat request.
 */

/** A fresh browser context has no projects — dismiss the first-run prompt. */
async function ensureProject(page: Page): Promise<void> {
  const skip = page.getByRole("button", { name: "Start with My Project" });
  const appeared = await skip
    .waitFor({ state: "visible", timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  if (appeared) await skip.click();
  // Creating the default project is async — wait until it is in IndexedDB,
  // or the seed below would read an empty projects store.
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const open = indexedDB.open("masarflow");
        open.onerror = () => resolve(false);
        open.onsuccess = () => {
          const db = open.result;
          const g = db.transaction("projects", "readonly").objectStore("projects").count();
          g.onsuccess = () => {
            db.close();
            resolve(g.result > 0);
          };
          g.onerror = () => {
            db.close();
            resolve(false);
          };
        };
      }),
    null,
    { timeout: 15_000 },
  );
}

interface Seeded {
  primaryId: string;
  backupId: string;
  threadId: string;
}

/**
 * Seed two saved connections (Primary / Backup) and a chat-mode thread whose
 * fallback chain is [Primary → Backup], straight into IndexedDB (the app's DB
 * is "masarflow"; stores and key paths from src/lib/db/index.ts).
 */
async function seed(page: Page): Promise<Seeded> {
  return page.evaluate(async () => {
    const open = () =>
      new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open("masarflow");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    const getAll = (db: IDBDatabase, store: string) =>
      new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const g = db.transaction(store, "readonly").objectStore(store).getAll();
        g.onsuccess = () => resolve(g.result as Record<string, unknown>[]);
        g.onerror = () => reject(g.error);
      });
    const put = (db: IDBDatabase, rows: [string, Record<string, unknown>][]) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(
          [...new Set(rows.map(([store]) => store))],
          "readwrite",
        );
        for (const [store, row] of rows) tx.objectStore(store).put(row);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });

    const db = await open();
    const projects = await getAll(db, "projects");
    const projectId = projects[0]?.id as string | undefined;
    if (!projectId) throw new Error("no project in IndexedDB");

    const now = Date.now();
    const primaryId = "conn-e2e-primary";
    const backupId = "conn-e2e-backup";
    const threadId = "thread-e2e-fallback";
    await put(db, [
      [
        "aiConnections",
        {
          id: primaryId,
          providerId: "anthropic",
          label: "Primary",
          apiKey: "sk-e2e-placeholder",
          baseUrl: "",
          createdAt: now,
          updatedAt: now,
        },
      ],
      [
        "aiConnections",
        {
          id: backupId,
          providerId: "openai",
          label: "Backup",
          apiKey: "sk-e2e-placeholder",
          baseUrl: "",
          createdAt: now + 1,
          updatedAt: now + 1,
        },
      ],
      [
        "chatThreads",
        {
          id: threadId,
          projectId,
          title: "Provider fallback",
          connectionId: primaryId,
          modelId: "primary-model",
          backend: "api",
          mode: "chat",
          reasoningEnabled: false,
          effort: "off",
          fallbacks: [{ connectionId: backupId, modelId: "backup-model" }],
          createdAt: now,
          updatedAt: now,
        },
      ],
    ]);
    db.close();
    return { primaryId, backupId, threadId };
  });
}

/** Read a chatThreads row back out of IndexedDB. */
async function readThread(page: Page, threadId: string) {
  return page.evaluate(
    async (id) =>
      new Promise<Record<string, unknown> | undefined>((resolve, reject) => {
        const req = indexedDB.open("masarflow");
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const g = db
            .transaction("chatThreads", "readonly")
            .objectStore("chatThreads")
            .get(id);
          g.onsuccess = () => {
            db.close();
            resolve(g.result as Record<string, unknown> | undefined);
          };
          g.onerror = () => {
            db.close();
            reject(g.error);
          };
        };
      }),
    threadId,
  );
}

interface MockedChat {
  /** Every /api/chat request, in order (the model each one asked for). */
  models: string[];
}

/**
 * Mock /api/chat: the primary model always 429s (so the client retries once
 * and then switches), the backup model streams a normal NDJSON turn.
 */
async function mockChat(page: Page): Promise<MockedChat> {
  const state: MockedChat = { models: [] };
  await page.route("**/api/chat", async (route) => {
    let model = "";
    try {
      model = String(
        (route.request().postDataJSON() as { model?: string } | null)?.model ??
          "",
      );
    } catch {
      // Not JSON — leave the model blank.
    }
    state.models.push(model);
    if (model === "primary-model") {
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ error: "429 rate limit" }),
      });
      return;
    }
    const events = [
      // Must not start like the user's message: the chat strips a leading
      // echo of the user's text (a reply opening "P…" after "ping" loses the
      // "P"). "Answer…" diverges on the first character and passes through.
      { type: "text", text: "Answer from the backup model." },
      { type: "done", stopReason: "end" },
    ];
    await route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body: events.map((e) => JSON.stringify(e)).join("\n") + "\n",
    });
  });
  return state;
}

/** Boot /chat with the first-run prompt dismissed and the seed in place. */
async function prepare(page: Page) {
  const mock = await mockChat(page);
  // Keep the run hermetic: the models.dev catalog is optional (the baked-in
  // catalog covers Anthropic/OpenAI); everything else stays local.
  await page.route(
    (url) => url.hostname === "models.dev",
    (route) => route.abort(),
  );
  await page.goto("/chat", { waitUntil: "domcontentloaded" });
  await ensureProject(page);
  const seeded = await seed(page);
  // fetchCatalog() resolves right after this local probe; waiting for it means
  // send() won't trip its "AI providers are still loading" guard.
  const catalogProbe = page.waitForResponse(
    (r) => r.url().includes("/api/ollama/models"),
    { timeout: 30_000 },
  );
  await page.goto(`/chat?thread=${seeded.threadId}`, {
    waitUntil: "domcontentloaded",
  });
  // Mode "chat" → this placeholder appears only once the seeded thread is
  // loaded from IndexedDB.
  const composer = page.getByPlaceholder("Message the model directly…");
  await expect(composer).toBeVisible({ timeout: 30_000 });
  await catalogProbe;
  return { ...seeded, mock, composer };
}

/**
 * Press Enter (repeatedly if needed) until the send path actually runs.
 * The chat refuses to start a turn while the provider catalog is loading —
 * the guard keeps the text in the composer, so a cleared composer means the
 * turn (or `/model` switch) went through.
 */
async function sendMessage(page: Page, composer: Locator, text: string) {
  await composer.fill(text);
  await expect(async () => {
    await composer.press("Enter");
    await expect(composer).toHaveValue("", { timeout: 2_000 });
  }).toPass({ timeout: 30_000, intervals: [300, 600, 1_200] });
}

test("falls back to the next connection after repeated 429s", async ({ page }) => {
  const { mock, composer } = await prepare(page);

  await sendMessage(page, composer, "ping");

  // The switch notice and the fallback's streamed reply both land on screen.
  await expect(
    page.getByText(/Switched to Backup:backup-model/).first(),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByText("Answer from the backup model.").first(),
  ).toBeVisible({ timeout: 30_000 });

  // Primary was tried twice (initial + one retry), then Backup answered.
  expect(mock.models.filter((m) => m === "primary-model")).toHaveLength(2);
  expect(mock.models.at(-1)).toBe("backup-model");
});

test("“Keep using this model” repoints the thread at the fallback", async ({
  page,
}) => {
  const { backupId, threadId, composer } = await prepare(page);

  await sendMessage(page, composer, "ping");

  // The notice offers the switch but the thread itself is untouched so far.
  const keep = page.getByRole("button", { name: "Keep using this model" });
  await expect(keep).toBeVisible({ timeout: 30_000 });
  expect((await readThread(page, threadId))?.connectionId).toBe(
    "conn-e2e-primary",
  );

  await keep.click();
  await expect(page.getByText("Now using Backup:backup-model").first()).toBeVisible();
  await expect
    .poll(async () => (await readThread(page, threadId))?.connectionId, {
      timeout: 10_000,
    })
    .toBe(backupId);
  expect((await readThread(page, threadId))?.modelId).toBe("backup-model");
});

test("/model switches connection and model with no network call", async ({
  page,
}) => {
  const { mock, composer } = await prepare(page);

  await sendMessage(page, composer, "/model Backup:fast-model");

  await expect(page.getByText("Now using Backup:fast-model").first()).toBeVisible();
  await expect(composer).toHaveValue("");

  // The command never reached the network: /api/chat was not called…
  expect(mock.models).toEqual([]);
  // …and the thread itself now points at Backup:fast-model.
  const thread = await readThread(page, "thread-e2e-fallback");
  expect(thread?.connectionId).toBe("conn-e2e-backup");
  expect(thread?.modelId).toBe("fast-model");
});
