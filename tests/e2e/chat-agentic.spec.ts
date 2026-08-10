import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * End-to-end chat coverage with a mocked OpenCode backend (/api/opencode/*):
 *  - agentic mode streams tool activity, file edits, and a final reply
 *  - OpenCode permission requests surface in the chat ApprovalCard and the
 *    reply is forwarded to the backend
 *  - chat mode streams plain text
 *  - refresh mid-turn resumes the live response without a duplicate request
 *  - double-send, multi-turn persistence, Stop, empty responses, failures
 *
 * The mock stands in for the OpenCode server; wire-level conversion is
 * covered by the unit tests. The app never talks to OpenCode directly — the
 * browser only hits the mocked /api/opencode/* backend routes.
 */

/** The shell only renders once the Python sidecar is healthy — uvicorn can
 * take ~10s+ to import its ML stack, so be generous here. */
async function waitForShell(page: Page) {
  await expect(
    page.getByRole("button", { name: "New chat" }).first(),
  ).toBeVisible({
    timeout: 60_000,
  });
}

function ndjson(events: Record<string, unknown>[]): string {
  return events.map((e) => JSON.stringify(e)).join("\n") + "\n";
}

const PROVIDERS_BODY = {
  providers: [
    {
      providerId: "fake",
      providerName: "Fake Provider",
      models: [
        {
          id: "fake-model",
          name: "Fake Model",
          capabilities: { reasoning: true, attachment: false, toolcall: true },
        },
      ],
    },
  ],
  cached: false,
};

interface MockState {
  sessions: Map<string, { id: string; directory: string }>;
  sessionSeq: number;
  approvals: { sessionId: string; permissionId: string; response: string }[];
  aborts: string[];
  undos: { sessionId: string; messageID: string }[];
  /**
   * What a normal (non-resume) send streams. `fn(requestBody)` may return the
   * event list or a Promise of it; set `hang` to hold the response open.
   */
  sendEvents: (body: Record<string, unknown>) => unknown[] | Promise<unknown[]>;
  hangSend: boolean;
  sendError: { status: number; error: string } | null;
  resumeEvents: Record<string, unknown>[];
  stateStatus: "busy" | "idle" | "missing";
}

/** Install the full mocked OpenCode backend surface. */
function mockOpenCode(page: Page, state: Partial<MockState> = {}): MockState {
  const s: MockState = {
    sessions: new Map(),
    sessionSeq: 0,
    approvals: [],
    aborts: [],
    undos: [],
    sendEvents: () => [
      { type: "text", text: "Hello from fake OpenCode." },
      { type: "done", stopReason: "end" },
    ],
    hangSend: false,
    sendError: null,
    resumeEvents: [],
    stateStatus: "idle",
    ...state,
  };

  const postBody = (route: Route): Record<string, unknown> => {
    try {
      return (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    } catch {
      return {};
    }
  };

  page.route("**/api/opencode/health", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, version: "1.18.15" }),
    }),
  );

  page.route("**/api/opencode/models", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(PROVIDERS_BODY),
    }),
  );

  // NOTE: URL globs match the full URL including query strings, so endpoints
  // called with query params need a trailing wildcard.
  page.route("**/api/opencode/session*", async (route) => {
    const method = route.request().method();
    if (method === "DELETE") {
      const url = new URL(route.request().url());
      s.sessions.delete(url.searchParams.get("sessionId") ?? "");
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      return;
    }
    const body = postBody(route);
    const id = `ses_e2e_${++s.sessionSeq}`;
    s.sessions.set(id, { id, directory: "C:\\workspace" });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        threadId: body.threadId,
        opencodeSessionId: id,
        directory: "C:\\workspace",
        created: true,
      }),
    });
  });

  page.route("**/api/opencode/state*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: s.stateStatus }),
    });
  });

  page.route("**/api/opencode/send", async (route) => {
    if (s.sendError) {
      await route.fulfill({
        status: s.sendError.status,
        contentType: "application/json",
        body: JSON.stringify({ error: s.sendError.error }),
      });
      return;
    }
    const body = postBody(route);
    const events = (body.resume ? s.resumeEvents : await s.sendEvents(body)) as Record<string, unknown>[];
    if (s.hangSend) {
      await new Promise((r) => setTimeout(r, 30_000));
    }
    try {
      await route.fulfill({
        status: 200,
        contentType: "application/x-ndjson",
        body: ndjson(events),
      });
    } catch {
      // The page aborted the fetch (Stop pressed) — expected.
    }
  });

  page.route("**/api/opencode/abort", async (route) => {
    const body = postBody(route);
    s.aborts.push(String(body.sessionId ?? ""));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  page.route("**/api/opencode/approval", async (route) => {
    const body = postBody(route);
    s.approvals.push({
      sessionId: String(body.sessionId ?? ""),
      permissionId: String(body.permissionId ?? ""),
      response: String(body.response ?? ""),
    });
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  page.route("**/api/opencode/undo", async (route) => {
    const body = postBody(route);
    s.undos.push({ sessionId: String(body.sessionId ?? ""), messageID: String(body.messageID ?? "") });
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  page.route("**/api/opencode/history*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ messages: [] }),
    }),
  );

  return s;
}

async function newThread(page: Page): Promise<string> {
  await page.getByRole("button", { name: "New chat" }).first().click();
  await page.waitForURL(/\?thread=/);
  const id = new URL(page.url()).searchParams.get("thread");
  if (!id) throw new Error("no ?thread= in URL");
  return id;
}

/** Count persisted user/assistant messages for a thread in IndexedDB. */
async function messageCounts(
  page: Page,
  threadId: string,
): Promise<{ user: number; assistant: number; assistantContents: string[] }> {
  return page.evaluate((tid) => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("masarflow");
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("chatMessages", "readonly");
        const g = tx.objectStore("chatMessages").getAll();
        g.onsuccess = () => {
          const rows = (
            g.result as {
              threadId: string;
              role: string;
              content: string;
              createdAt: number;
            }[]
          )
            .filter((m) => m.threadId === tid)
            .sort((a, b) => a.createdAt - b.createdAt);
          resolve({
            user: rows.filter((m) => m.role === "user").length,
            assistant: rows.filter((m) => m.role === "assistant").length,
            assistantContents: rows
              .filter((m) => m.role === "assistant")
              .map((m) => m.content),
          });
        };
        g.onerror = () => reject(g.error);
      };
      req.onerror = () => reject(req.error);
    });
  }, threadId);
}

/** The app's active project id (localStorage-backed zustand store). */
async function activeProjectId(page: Page): Promise<string> {
  return page.evaluate(() => {
    try {
      const raw = localStorage.getItem("masarflow-active-project");
      const parsed = raw ? (JSON.parse(raw) as { state?: { activeProjectId?: string | null } }) : null;
      return parsed?.state?.activeProjectId ?? "";
    } catch {
      return "";
    }
  });
}

/** Seed a thread row (with its OpenCode session) into IndexedDB. */
async function seedThread(
  page: Page,
  threadId: string,
  sessionId: string,
  messages: { id: string; role: string; content: string; status?: string; createdAt: number }[],
): Promise<void> {
  const projectId = await activeProjectId(page);
  if (!projectId) throw new Error("no active project in the e2e app");
  await page.evaluate(
    ({ tid, sid, pid, msgs }) => {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open("masarflow");
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(["chatThreads", "chatMessages"], "readwrite");
          tx.objectStore("chatThreads").put({
            id: tid,
            projectId: pid,
            title: "Seeded",
            connectionId: "",
            modelId: "fake-model",
            mode: "agentic",
            reasoningEnabled: false,
            opencodeSessionId: sid,
            opencodeDirectory: "C:\\workspace",
            providerId: "fake",
            createdAt: Date.now() - 2000,
            updatedAt: Date.now() - 1000,
          });
          for (const m of msgs) {
            tx.objectStore("chatMessages").put({
              id: m.id,
              threadId: tid,
              role: m.role,
              content: m.content,
              status: m.status ?? "done",
              createdAt: m.createdAt,
            });
          }
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      });
    },
    { tid: threadId, sid: sessionId, pid: projectId, msgs: messages },
  );
}

test("agentic chat streams tool activity, file edits, and a final reply", async ({ page }) => {
  mockOpenCode(page, {
    sendEvents: () => [
      { type: "tool_call", id: "c1", name: "bash", arguments: { command: "Get-ChildItem" } },
      { type: "tool_running", id: "c1", name: "bash", title: "Get-ChildItem" },
      { type: "tool_result", id: "c1", name: "bash", ok: true, content: "24 entries" },
      { type: "file", path: "src/example.ts" },
      { type: "step", step: 1 },
      { type: "text", text: "I listed the directory and edited " },
      { type: "text", text: "example.ts." },
      { type: "message_id", messageId: "msg_e2e_1" },
      { type: "done", stopReason: "end" },
    ],
  });

  await page.goto("/chat", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  const threadId = await newThread(page);

  const composer = page.locator("textarea");
  await composer.fill("Inspect the workspace");
  await composer.press("Enter");

  await expect(page.getByText("I listed the directory and edited example.ts.")).toBeVisible({
    timeout: 30_000,
  });
  // Tool chip for the bash call.
  await expect(page.getByText("bash").first()).toBeVisible();
  // File-edit chip for the patch part.
  await expect(page.getByText("src/example.ts")).toBeVisible();

  const counts = await messageCounts(page, threadId);
  expect(counts.user).toBe(1);
  expect(counts.assistant).toBe(1);
  expect(counts.assistantContents[0]).toContain("example.ts.");
  // The session id was persisted onto the thread.
  const sessionIds = await page.evaluate(() => {
    return new Promise<string[]>((resolve, reject) => {
      const req = indexedDB.open("masarflow");
      req.onsuccess = () => {
        const db = req.result;
        const g = db.transaction("chatThreads", "readonly").objectStore("chatThreads").getAll();
        g.onsuccess = () => resolve(g.result.map((t) => t.opencodeSessionId).filter(Boolean));
        g.onerror = () => reject(g.error);
      };
      req.onerror = () => reject(req.error);
    });
  });
  expect(sessionIds).toContain("ses_e2e_1");
});

test("OpenCode permission requests appear in the ApprovalCard and are forwarded", async ({
  page,
}) => {
  const state = mockOpenCode(page, {
    sendEvents: () => [
      {
        type: "approval",
        permissionId: "prm_1",
        permissionType: "bash",
        title: "Run command",
        pattern: "npm run build",
      },
      { type: "text", text: "Building now…" },
      { type: "message_id", messageId: "msg_e2e_2" },
      { type: "done", stopReason: "end" },
    ],
  });

  await page.goto("/chat", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await newThread(page);

  const composer = page.locator("textarea");
  await composer.fill("Build the project");
  await composer.press("Enter");

  await expect(page.getByText("Run this command?").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("npm run build")).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();

  // The card clears and the reply streams.
  await expect(page.getByText("Building now…")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Run this command?")).toHaveCount(0);
  expect(state.approvals).toHaveLength(1);
  expect(state.approvals[0].response).toBe("once");
});

test("chat mode streams a plain text reply", async ({ page }) => {
  mockOpenCode(page, {
    sendEvents: () => [
      { type: "text", text: "Hello from the mock backend." },
      { type: "done", stopReason: "end" },
    ],
  });

  await page.goto("/chat", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  const threadId = await newThread(page);

  const composer = page.locator("textarea");
  await composer.fill("Say hi");
  await composer.press("Enter");

  await expect(page.getByText("Hello from the mock backend.")).toBeVisible({
    timeout: 30_000,
  });
  const counts = await messageCounts(page, threadId);
  expect(counts.user).toBe(1);
  expect(counts.assistant).toBe(1);
});

test("a refresh mid-turn resumes the live response without a duplicate", async ({ page }) => {
  const state = mockOpenCode(page, {
    resumeEvents: [
      { type: "resumed" },
      { type: "text", text: "Recovered answer." },
      { type: "message_id", messageId: "msg_e2e_3" },
      { type: "done", stopReason: "end" },
    ],
  });
  state.stateStatus = "busy";

  await page.goto("/chat", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  const threadId = "thread-resume-1";
  // A session that is still processing, left behind by a page refresh.
  await seedThread(page, threadId, "ses_e2e_resume", [
    { id: "seed-u1", role: "user", content: "seeded question", createdAt: Date.now() - 1000 },
    { id: "seed-a1", role: "assistant", content: "", status: "streaming", createdAt: Date.now() - 500 },
  ]);

  await page.goto(`/chat?thread=${threadId}`, { waitUntil: "domcontentloaded" });
  await waitForShell(page);

  // The reply is reconstructed from the resumed stream.
  await expect(page.getByText("Recovered answer.")).toBeVisible({ timeout: 30_000 });
  const counts = await messageCounts(page, threadId);
  expect(counts.user).toBe(1);
  expect(counts.assistant).toBe(1);
  expect(counts.assistantContents[0]).toBe("Recovered answer.");
});

test("a dead session marks the interrupted message for Retry", async ({ page }) => {
  const state = mockOpenCode(page, {});
  state.stateStatus = "idle";

  await page.goto("/chat", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  const threadId = "thread-dead-1";
  await seedThread(page, threadId, "ses_e2e_dead", [
    { id: "seed-u1", role: "user", content: "seeded question", createdAt: Date.now() - 1000 },
    { id: "seed-a1", role: "assistant", content: "", status: "streaming", createdAt: Date.now() - 500 },
  ]);

  await page.goto(`/chat?thread=${threadId}`, { waitUntil: "domcontentloaded" });
  await waitForShell(page);

  // The stuck bubble renders as interrupted with Retry — never a silent blank.
  await expect(page.getByText(/interrupted before it finished/i)).toBeVisible({
    timeout: 30_000,
  });
});

test("rapid double-send creates exactly one user and one assistant message", async ({ page }) => {
  mockOpenCode(page, {
    sendEvents: () => [
      { type: "text", text: "All good." },
      { type: "done", stopReason: "end" },
    ],
  });

  await page.goto("/chat", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  const threadId = await newThread(page);

  const composer = page.locator("textarea");
  await composer.fill("double fire check");
  await composer.press("Enter");
  await composer.press("Enter");

  await expect(page.getByText("All good.")).toBeVisible({ timeout: 30_000 });
  const counts = await messageCounts(page, threadId);
  expect(counts.user).toBe(1);
  expect(counts.assistant).toBe(1);
});

test("three consecutive messages all complete and persist once each", async ({ page }) => {
  let turn = 0;
  mockOpenCode(page, {
    sendEvents: () => [{ type: "text", text: `Reply ${++turn}.` }, { type: "done", stopReason: "end" }],
  });

  await page.goto("/chat", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  const threadId = await newThread(page);

  const composer = page.locator("textarea");
  for (const [i, text] of ["one", "two", "three"].entries()) {
    await composer.fill(`message ${text}`);
    await composer.press("Enter");
    await expect(page.getByText(`Reply ${i + 1}.`)).toBeVisible({ timeout: 30_000 });
  }

  const counts = await messageCounts(page, threadId);
  expect(counts.user).toBe(3);
  expect(counts.assistant).toBe(3);
  expect(counts.assistantContents).toEqual(["Reply 1.", "Reply 2.", "Reply 3."]);
});

test("stop aborts the turn, marks it cancelled, and a follow-up send still works", async ({ page }) => {
  const state = mockOpenCode(page, { hangSend: true });
  state.hangSend = true;

  await page.goto("/chat", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  const threadId = await newThread(page);

  const composer = page.locator("textarea");
  await composer.fill("first question");
  await composer.press("Enter");

  await page.getByRole("button", { name: "Stop" }).click();

  // A genuine user cancellation says "Stopped." and offers no Retry.
  await expect(page.getByText("Stopped.")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);
  // The Stop request reached the backend (server-side abort of the session).
  expect(state.aborts.length).toBeGreaterThanOrEqual(1);

  // The UI is idle again: a follow-up completes normally.
  state.hangSend = false;
  state.sendEvents = () => [
    { type: "text", text: "Follow-up answer." },
    { type: "done", stopReason: "end" },
  ];
  await composer.fill("follow up");
  await composer.press("Enter");
  await expect(page.getByText("Follow-up answer.")).toBeVisible({ timeout: 30_000 });
  const counts = await messageCounts(page, threadId);
  expect(counts.user).toBe(2);
  expect(counts.assistant).toBe(2);
});

test("an empty response surfaces a retryable error, never a blank bubble", async ({ page }) => {
  mockOpenCode(page, {
    sendEvents: () => [{ type: "done", stopReason: "end" }],
  });

  await page.goto("/chat", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await newThread(page);

  const composer = page.locator("textarea");
  await composer.fill("say something");
  await composer.press("Enter");

  await expect(page.getByText(/returned an empty response/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
});

test("a backend failure surfaces the actual error with Retry", async ({ page }) => {
  mockOpenCode(page, { sendError: { status: 503, error: "The AI agent service is unavailable" } });

  await page.goto("/chat", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await newThread(page);

  const composer = page.locator("textarea");
  await composer.fill("boom please");
  await composer.press("Enter");

  await expect(page.getByText(/AI agent service is unavailable/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
});

test("the file-edit Undo action reverts through the backend", async ({ page }) => {
  const state = mockOpenCode(page, {
    sendEvents: () => [
      { type: "file", path: "src/thing.ts" },
      { type: "text", text: "Edited thing.ts." },
      { type: "message_id", messageId: "msg_e2e_undo" },
      { type: "done", stopReason: "end" },
    ],
  });

  await page.goto("/chat", { waitUntil: "domcontentloaded" });
  await waitForShell(page);
  await newThread(page);

  const composer = page.locator("textarea");
  await composer.fill("Edit thing.ts");
  await composer.press("Enter");

  await expect(page.getByText("Edited thing.ts.")).toBeVisible({ timeout: 30_000 });
  const undoButton = page.getByRole("button", { name: "Undo this reply's file changes" });
  await expect(undoButton).toBeVisible();
  await undoButton.click();

  await expect
    .poll(() => state.undos.length, { timeout: 5_000 })
    .toBeGreaterThanOrEqual(1);
  expect(state.undos[0].messageID).toBe("msg_e2e_undo");
});
