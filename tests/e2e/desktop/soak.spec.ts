import os from "node:os";
import { test, expect, launchApp, writeEvidence } from "./_harness";
import { BUDGETS } from "./perf-budgets";

/**
 * P9.T21 — memory ceiling after 10 minutes idle, with a project open.
 *
 * Main-process RSS comes from ElectronApplication.evaluate (runs in the main
 * process); the renderer's JS heap comes from CDP Performance.getMetrics on
 * the page's session. Run with `pnpm e2e:desktop:slow` — it takes 10+ minutes.
 *
 * Diagnostics: if the app closes mid-run, the evidence records why — process
 * exit code/signal, main-process stdout/stderr, page crash/close, app close,
 * render-process-gone / child-process-gone (RPG/CPG, polled from the main
 * process so a dead renderer still reports), and a main-RSS + renderer-heap
 * sample every 30 s so any climb before a death is visible. The evidence file
 * is rewritten on every sample, so it survives a mid-run death. at2 is taken
 * at the real 2-minute mark, not right after launch.
 */

test.describe.configure({ mode: "serial" });

type ElectronApplication = import("@playwright/test").ElectronApplication;
type Page = import("@playwright/test").Page;

const SAMPLE_EVERY_MS = 30_000;
const AT2_MS = 2 * 60 * 1000;
const AT10_MS = 10 * 60 * 1000;

interface Sample {
  atMs: number;
  main: number | null;
  renderer: number | null;
  gone?: unknown[];
  mainError?: string;
  rendererError?: string;
}

/** Main-process RSS via ElectronApplication.evaluate (runs in the main process). */
async function mainRssMb(app: ElectronApplication): Promise<number> {
  const bytes = await app.evaluate(() => process.memoryUsage().rss);
  return Math.round(bytes / 1024 / 1024);
}

/** Renderer JS heap via CDP Performance.getMetrics on the page's session. */
async function rendererHeapMb(app: ElectronApplication, page: Page): Promise<number> {
  const cdp = await app.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  const { metrics } = await cdp.send("Performance.getMetrics");
  const used = metrics.find((m) => m.name === "JSHeapUsedSize")?.value ?? -1;
  await cdp.detach();
  return Math.round(used / 1024 / 1024);
}

test("@slow perf: memory stays inside the ceiling after 10 minutes idle", async () => {
  test.setTimeout(16 * 60 * 1000); // the config's 180 s default is far too short
  const startedAt = Date.now();
  const elapsed = () => Date.now() - startedAt;

  const timeline: { atMs: number; event: string; detail?: unknown }[] = [];
  const samples: Sample[] = [];
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  let at2: { main: number; renderer: number } | null = null;
  let at10: { main: number; renderer: number } | null = null;

  const evidence: Record<string, unknown> = {
    startedAt: new Date(startedAt).toISOString(),
    machine: {
      os: `${os.platform()} ${os.release()} ${os.arch()}`,
      cpu: os.cpus()[0]?.model ?? "unknown",
      cores: os.cpus().length,
      memoryGb: Math.round(os.totalmem() / 1024 / 1024 / 1024),
      node: process.version,
    },
    budgets: BUDGETS.memory,
  };
  const persist = () => {
    evidence.timeline = timeline;
    evidence.samples = samples;
    evidence.stdoutTail = stdoutLines.slice(-200);
    evidence.stderrTail = stderrLines.slice(-200);
    evidence.at2 = at2;
    evidence.at10 = at10;
    writeEvidence("perf-memory-10min.json", evidence);
  };
  const log = (event: string, detail?: unknown) => {
    timeline.push({ atMs: elapsed(), event, detail });
    console.log(
      `[soak +${(elapsed() / 1000).toFixed(1)}s] ${event}` +
        (detail === undefined ? "" : ` ${JSON.stringify(detail)}`),
    );
    persist();
  };

  const { app, page, close } = await launchApp({ seed: "demo" });

  // ---- diagnostics: record why the app closes, if it does -------------------
  const proc = app.process();
  log("launched", { pid: proc.pid });
  proc.on("exit", (code, signal) => log("process-exit", { code, signal }));
  proc.stdout?.on("data", (chunk: Buffer) => {
    for (const line of chunk.toString().split("\n")) {
      if (line.trim()) stdoutLines.push(line);
    }
  });
  proc.stderr?.on("data", (chunk: Buffer) => {
    for (const line of chunk.toString().split("\n")) {
      if (line.trim()) stderrLines.push(line);
    }
  });
  app.on("close", () => log("app-close"));
  page.on("crash", () => log("page-crash"));
  page.on("close", () => log("page-close"));
  await app.evaluate(({ app: electronApp }) => {
    const g = globalThis as typeof globalThis & {
      __soakGone?: Array<{ kind: string; details: unknown }>;
    };
    g.__soakGone = [];
    electronApp.on("render-process-gone", (_event, _webContents, details) => {
      g.__soakGone?.push({ kind: "RPG", details });
      console.log(`[soak-main] RPG ${JSON.stringify(details)}`);
    });
    electronApp.on("child-process-gone", (_event, details) => {
      g.__soakGone?.push({ kind: "CPG", details });
      console.log(`[soak-main] CPG ${JSON.stringify(details)}`);
    });
  });
  const goneEvents = async (): Promise<unknown[]> => {
    try {
      return await app.evaluate(() => {
        const g = globalThis as typeof globalThis & { __soakGone?: unknown[] };
        return g.__soakGone ?? [];
      });
    } catch {
      return [];
    }
  };
  log("diagnostics-attached");

  try {
    // Sample every 30 s through minute 10. at2 is taken at the real 2-minute
    // mark; a sample right after launch does not show a climb.
    for (let t = SAMPLE_EVERY_MS; t <= AT10_MS; t += SAMPLE_EVERY_MS) {
      const remaining = startedAt + t - Date.now();
      if (remaining > 0) {
        try {
          await page.waitForTimeout(remaining);
        } catch (err) {
          const gone = await goneEvents();
          log("sampling-aborted", {
            atMs: elapsed(),
            reason: String(err).split("\n")[0],
            gone,
          });
          break;
        }
      }
      const sample: Sample = { atMs: elapsed(), main: null, renderer: null };
      try {
        sample.main = await mainRssMb(app);
      } catch (err) {
        sample.mainError = String(err).split("\n")[0];
      }
      try {
        sample.renderer = await rendererHeapMb(app, page);
      } catch (err) {
        sample.rendererError = String(err).split("\n")[0];
      }
      sample.gone = await goneEvents();
      samples.push(sample);
      if (!at2 && sample.atMs >= AT2_MS && sample.main !== null && sample.renderer !== null) {
        at2 = { main: sample.main, renderer: sample.renderer };
        log("at2", at2);
      }
      if (sample.main !== null && sample.renderer !== null) {
        at10 = { main: sample.main, renderer: sample.renderer };
      }
      log("sample", sample);
    }

    const at2Final = at2;
    const at10Final = at10;
    if (!at2Final || !at10Final) {
      throw new Error(
        `soak aborted before minute 10 (at2=${at2Final ? "ok" : "missing"}, ` +
          `at10=${at10Final ? "ok" : "missing"}) — see timeline/samples in reports/p9/perf-memory-10min.json`,
      );
    }
    const growthPct = Math.round(
      ((at10Final.renderer - at2Final.renderer) / Math.max(1, at2Final.renderer)) * 100,
    );
    evidence.growthPct = growthPct;
    persist();

    expect(at10Final.main, `main RSS ${at10Final.main} MB`).toBeLessThanOrEqual(
      BUDGETS.memory.mainRssMb,
    );
    expect(at10Final.renderer, `renderer heap ${at10Final.renderer} MB`).toBeLessThanOrEqual(
      BUDGETS.memory.rendererHeapMb,
    );
    expect(growthPct, `heap growth ${growthPct}% over 8 minutes`).toBeLessThanOrEqual(
      BUDGETS.memory.growth2to10MinPct,
    );
    evidence.verdict = "pass";
    persist();
  } catch (err) {
    evidence.verdict = "fail";
    evidence.failure = String(err).split("\n")[0];
    persist();
    throw err;
  } finally {
    await close();
  }
});
