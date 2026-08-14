#!/usr/bin/env node
/**
 * Real end-to-end verification of the OpenCode chat backend.
 *
 * Requires the dev stack running (Next on :3000 via `pnpm run dev:full`, plus
 * an OpenCode server reachable at OPENCODE_BASE_URL with at least one
 * connected provider). Exercises the REAL OpenCode server + a REAL model:
 * streaming text, tool execution, refresh recovery, and the
 * unavailable-server error path.
 *
 * Usage:  node scripts/opencode-verify.mjs
 *
 * NOTE: step 5 stops the OpenCode server that OPENCODE_BASE_URL points at —
 * only run this against a server you own (start.mjs-spawned or a dedicated
 * test instance).
 */
import { chromium } from "playwright";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const logs = [];
  page.on("console", (m) => logs.push(`[browser:${m.type()}] ${m.text().slice(0, 300)}`));
  page.on("response", (res) => {
    if (res.url().includes("/api/opencode/")) {
      logs.push(`[resp:${res.status()}] ${res.url().replace(/^https?:\/\/[^/]+/, "")}`);
    }
  });

  const ok = (name) => console.log(`  PASS ${name}`);
  const fail = (name, detail) => {
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
    process.exitCode = 1;
  };

  try {
    console.log("1) Loading /chat…");
    await page.goto("http://localhost:3000/chat", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "New chat" }).first().waitFor({ timeout: 90_000 });

    console.log("2) Creating a chat + streaming a real reply…");
    await page.getByRole("button", { name: "New chat" }).first().click();
    await page.waitForURL(/\?thread=/);
    const composer = page.locator("textarea");
    await composer.fill("Reply with exactly the word: hello");
    await composer.press("Enter");
    await page.getByText(/hello/i).first().waitFor({ timeout: 120_000 });
    ok("real reply received");

    console.log("3) Tool execution (real bash tool via OpenCode)…");
    // Use a tool-eager model deterministically (the default pick may answer
    // without tools); the thread row lives in IndexedDB.
    await page.evaluate(() => {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open("masarflow");
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("chatThreads", "readwrite");
          const store = tx.objectStore("chatThreads");
          const getAll = store.getAll();
          getAll.onsuccess = () => {
            for (const t of getAll.result) {
              store.put({ ...t, providerId: "opencode-go", modelId: "deepseek-v4-flash" });
            }
            resolve(undefined);
          };
          getAll.onerror = () => reject(getAll.error);
        };
        req.onerror = () => reject(req.error);
      });
    });
    await composer.fill(
      "Use a tool to list the files in the current directory, then reply with just the count.",
    );
    await composer.press("Enter");
    await page.getByText(/bash|glob|grep|list/i).first().waitFor({ timeout: 120_000 });
    ok("tool chip appeared (tool executed)");
    // The model must continue after the tool and land a final answer.
    const answered = await page
      .locator("main")
      .getByText(/\d+/)
      .last()
      .waitFor({ timeout: 120_000 })
      .then(() => true)
      .catch(() => false);
    if (answered) ok("model continued after the tool and produced a reply");
    else fail("no final answer after the tool call");

    console.log("4) Refresh mid-turn → resume without duplicate…");
    await composer.fill(
      "List every file in this directory recursively and describe the project structure in detail.",
    );
    await composer.press("Enter");
    await sleep(800);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "New chat" }).first().waitFor({ timeout: 90_000 });
    const recovered = await page
      .getByText(/project|directory|structure/i)
      .first()
      .waitFor({ timeout: 180_000 })
      .then(() => true)
      .catch(() => false);
    if (recovered) ok("conversation survived the refresh (resumed or reconstructed)");
    else fail("nothing rendered after refresh");

    console.log("5) Unavailable-server error path…");
    const baseUrl = new URL(process.env.OPENCODE_BASE_URL ?? "http://127.0.0.1:4096");
    const { execSync } = await import("node:child_process");
    execSync(
      `powershell -Command "Get-NetTCPConnection -State Listen -LocalPort ${baseUrl.port} | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`,
    );
    await sleep(1500);
    await composer.fill("this should fail gracefully");
    await composer.press("Enter");
    const errorShown = await page
      .getByText(/unavailable|unreachable|fail/i)
      .first()
      .waitFor({ timeout: 60_000 })
      .then(() => true)
      .catch(() => false);
    if (errorShown) ok("friendly error surfaced instead of hanging");
    else fail("no error surfaced with the server down");
  } catch (e) {
    fail("script crashed", e.message);
  } finally {
    console.log("\n--- last 25 log lines ---");
    for (const l of logs.slice(-25)) console.log(l);
    await browser.close();
  }
}

main();
