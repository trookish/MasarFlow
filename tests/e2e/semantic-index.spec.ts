import { test, expect, type Page } from "@playwright/test";

/**
 * The local semantic index, end to end (P3.T9). Two notes are created through
 * the Brain editor, the settings card builds the index in a browser worker
 * (bundled MiniLM model — no Python, no network), and /search then ranks by
 * meaning: the query shares no words with the note it must find.
 */

/** A fresh browser context has no projects — dismiss the first-run prompt. */
async function ensureProject(page: Page): Promise<void> {
  const skip = page.getByRole("button", { name: "Start with My Project" });
  const appeared = await skip
    .waitFor({ state: "visible", timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  if (appeared) await skip.click();
}

/** Create a note in the Brain editor (autosave debounce is 450 ms). */
async function addNote(page: Page, title: string, body: string): Promise<void> {
  const prev = await page.evaluate(() => new URL(location.href).searchParams.get("note"));
  await page.getByRole("button", { name: "New note" }).first().click();
  // `createNote` awaits the DB write and then replaces the route — wait for the
  // switch (and for the one editor holding the fresh note), or the fills land
  // on the previously open note.
  await page.waitForFunction((p) => new URL(location.href).searchParams.get("note") !== p, prev, {
    timeout: 15_000,
  });
  await page.waitForFunction(
    () => {
      const inputs = [...document.querySelectorAll<HTMLInputElement>('input[placeholder="Untitled note"]')];
      return inputs.length === 1 && inputs[0].value === "Untitled note";
    },
    null,
    { timeout: 15_000 },
  );
  await page.locator('input[placeholder="Untitled note"]').fill(title);
  await page.locator(".cm-content").first().click();
  await page.keyboard.type(body);
  await page.waitForTimeout(900);
}

/** Poll a predicate without Playwright's auto-retry (state-text checks). */
async function waitFor(cb: () => Promise<boolean>, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await cb()) return true;
    if (Date.now() > deadline) return false;
    await new Promise((r) => setTimeout(r, 500));
  }
}

test("/settings: semantic index builds locally and finds by meaning", async ({ page }) => {
  // Building the index loads a ~23 MB model; allow for a cold first run.
  test.setTimeout(420_000);

  // Offline proof: the model and ORT wasm are served from the app bundle, so
  // the index flow must succeed with every non-localhost request blocked. The
  // app's optional extras (update check, GitHub panel, models.dev catalog) are
  // the only things that may appear here — and none of the index machinery may.
  const external: string[] = [];
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return route.continue();
    external.push(url.href);
    return route.abort();
  });

  await page.goto("/brain", { waitUntil: "domcontentloaded" });
  await ensureProject(page);
  await addNote(page, "Login flow", "Users sign in with a JWT access token that expires after fifteen minutes.");
  await addNote(page, "Cake", "Chocolate cake needs eggs, flour and cocoa.");

  // The settings card drives and reports the index.
  await page.goto("/settings", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Local AI Service", exact: true }).click();
  const status = page.getByTestId("semantic-status");
  const count = page.getByTestId("semantic-count");

  // The periodic reindex fires 3 s after boot; on a cold index it embeds the
  // notes and the model loads. When an earlier page already built the index,
  // no embedding happens in THIS document (status stays idle) — force a build
  // through the card instead.
  const started = await waitFor(async () => /Ready|Loading/.test(await status.innerText()), 10_000);
  if (!started) await page.getByRole("button", { name: "Rebuild index" }).click();

  await expect(status).toHaveText("Ready", { timeout: 120_000 });
  await expect
    .poll(async () => Number(await count.innerText()), { timeout: 30_000 })
    .toBeGreaterThanOrEqual(2);

  // /search ranks by meaning: "how do people authenticate" shares no words
  // with the note it must find, and must not surface the cake note.
  await page.goto("/search", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/\d+ item/)).toBeVisible();
  const box = page.getByPlaceholder(/Search across/);
  await box.click();
  await box.fill("how do people authenticate");
  // The first semantic search on this page warms the worker's model again.
  await expect(page.locator("[data-idx='0']")).toContainText("Login flow", { timeout: 90_000 });
  await expect(page.locator("[data-idx]").filter({ hasText: "Cake" })).toHaveCount(0);

  // No index machinery ever reached outside the app bundle (see the handler
  // above): the blocked calls, if any, are only the app's optional extras.
  test.info().annotations.push({ type: "blocked-external", description: external.join("\n") || "none" });
  expect(external.filter((u) => /huggingface|cdn|jsdelivr|unpkg|onnx/i.test(u))).toEqual([]);
});
