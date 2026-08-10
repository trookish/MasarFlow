import { app, type BrowserWindow } from "electron";
import { appendFileSync } from "node:fs";

/**
 * GUI smoke test: dump DOM state from the real window to a log file.
 * With MASARFLOW_LAUNCHER_GUITEST_RUN=1 it also clicks "Start development",
 * waits for port 3000, then clicks "Stop" and verifies teardown.
 * Triggered with MASARFLOW_LAUNCHER_GUITEST=<logfile> npm start
 */
export function startGuiTest(win: BrowserWindow): void {
  const logFile = process.env.MASARFLOW_LAUNCHER_GUITEST;
  if (!logFile) return;
  const deep = process.env.MASARFLOW_LAUNCHER_GUITEST_RUN === "1";
  const log = (msg: string): void => {
    appendFileSync(logFile, `${msg}\n`, "utf8");
  };

  const errors: string[] = [];
  const consoleLines: string[] = [];
  win.webContents.on("console-message", (_e, level, message) => {
    if (level === 3) errors.push(message);
    if (level <= 1 && message.includes("[nav]")) consoleLines.push(message);
  });
  win.webContents.on("did-fail-load", (_e, code, desc) => {
    errors.push(`did-fail-load ${code} ${desc}`);
  });

  const dump = async (_tag: string): Promise<string> => {
    return win.webContents.executeJavaScript(`(() => {
      const root = document.getElementById('root');
      const text = (el) => (el ? el.textContent.replace(/\\s+/g, ' ').trim().slice(0, 900) : null);
      const clicks = [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).filter(Boolean);
      return JSON.stringify({
        rootText: text(root),
        buttons: clicks.slice(0, 16),
      });
    })()`);
  };

  const clickButton = async (label: string): Promise<boolean> => {
    return win.webContents.executeJavaScript(`(() => {
      const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim().includes(${JSON.stringify(label)}));
      if (!b) return false;
      b.click();
      return true;
    })()`);
  };

  const waitPort = async (port: number, timeoutMs: number): Promise<boolean> => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(1500) });
        return true;
      } catch {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    return false;
  };

  const finish = (code: number): void => {
    if (consoleLines.length) log(`GUI-NAV: ${consoleLines.join(" | ")}`);
    log(`GUI-ERRORS: ${errors.length ? errors.join(" | ") : "none"}`);
    app.exit(code);
  };

  win.webContents.once("did-finish-load", () => {
    setTimeout(() => {
      void (async () => {
        const d1 = await dump("initial");
        log(`GUI-1: ${d1}`);
        if (!deep) return finish(0);

        const clicked = await clickButton("Start development");
        log(`GUI: clickedStart=${clicked}`);
        const up = await waitPort(3000, 200_000);
        log(`GUI: port3000=${up}`);
        const d2 = await dump("running");
        log(`GUI-2: ${d2}`);
        if (!up) return finish(1);

        const stopped = await clickButton("Stop");
        log(`GUI: clickedStop=${stopped}`);
        await new Promise((r) => setTimeout(r, 6000));
        const still = await (async () => {
          try {
            await fetch("http://127.0.0.1:3000", { signal: AbortSignal.timeout(1500) });
            return true;
          } catch {
            return false;
          }
        })();
        log(`GUI: port3000AfterStop=${still}`);
        const d3 = await dump("stopped");
        log(`GUI-3: ${d3}`);
        finish(still ? 1 : 0);
      })();
    }, 3500);
  });
}
