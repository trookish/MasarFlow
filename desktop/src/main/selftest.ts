import { app } from "electron";
import { appendFileSync } from "node:fs";
import type { SessionExitPayload } from "@shared/types";
import { ptyManager } from "./pty";
import { createSetupEngine, currentTargetDir } from "./setup";
import { readEnv, parseLines } from "./env";
import { settings } from "./settings";

/**
 * Scripted smoke test for the main process. Run with
 * MASARFLOW_LAUNCHER_SELFTEST=<logfile> pnpm start
 */
export function maybeRunSelfTest(): void {
  const logFile = process.env.MASARFLOW_LAUNCHER_SELFTEST;
  if (!logFile) return;
  const log = (msg: string): void => {
    appendFileSync(logFile, `${msg}\n`, "utf8");
  };

  void (async () => {
    log("SELFTEST: begin");
    settings.init();
    const targetDir = currentTargetDir();
    log(`SELFTEST: targetDir=${targetDir}`);

    const engine = createSetupEngine(() => {});
    engine.init(targetDir);
    const state = await engine.check(targetDir);
    log(
      `SELFTEST: setup initialized=${state.initialized} steps=${state.steps
        .map((s) => `${s.key}:${s.status}`)
        .join(",")}`,
    );

    const env = readEnv(targetDir);
    log(`SELFTEST: env fields=${env.fields.length} lines=${parseLines(env.content).length}`);

    // 1. PTY echo test — spawn cmd, wait for exit.
    const echoCode = await new Promise<number | null>((resolvePromise) => {
      const info = ptyManager.start({
        label: "selftest echo",
        kind: "test",
        command: "echo HELLO_MASAR",
        file: "cmd.exe",
        args: ["/c", "echo HELLO_MASAR && exit 7"],
        cwd: targetDir,
      });
      const timer = setTimeout(() => {
        log("SELFTEST: echo timeout");
        resolvePromise(null);
      }, 20_000);
      const onExit = (p: SessionExitPayload): void => {
        if (p.id !== info.id) return;
        ptyManager.removeListener("exit", onExit);
        clearTimeout(timer);
        log(`SELFTEST: echo exit=${p.exitCode} bufferHasHello=${ptyManager.buffer(info.id).includes("HELLO_MASAR")}`);
        resolvePromise(p.exitCode);
      };
      ptyManager.on("exit", onExit);
    });
    void echoCode;

    // 2. Kill test — start a long sleep, kill, ensure it dies.
    const killOk = await new Promise<boolean>((resolvePromise) => {
      const info = ptyManager.start({
        label: "selftest kill",
        kind: "test",
        command: "ping -t 127.0.0.1",
        file: "cmd.exe",
        args: ["/c", "ping -n 60 127.0.0.1"],
        cwd: targetDir,
      });
      setTimeout(() => ptyManager.kill(info.id), 1500);
      setTimeout(() => {
        const alive = ptyManager.list().some((s) => s.id === info.id);
        log(`SELFTEST: kill removed=${!alive}`);
        resolvePromise(!alive);
      }, 5000);
    });
    void killOk;

    // 3. Full dev:full run — wait for port 3000, then kill the tree.
    const devOk = await new Promise<boolean>((resolvePromise) => {
      const info = ptyManager.start({
        label: "selftest dev:full",
        kind: "run",
        command: "pnpm run dev:full",
        file: "cmd.exe",
        args: ["/c", "pnpm run dev:full"],
        cwd: targetDir,
      });
      const deadline = Date.now() + 240_000;
      const poll = async (): Promise<void> => {
        const reached = await (async () => {
          try {
            await fetch("http://127.0.0.1:3000", { signal: AbortSignal.timeout(1500) });
            return true;
          } catch {
            return false;
          }
        })();
        if (reached) {
          log("SELFTEST: dev:full reached :3000");
          log(
            `SELFTEST: dev tail=${JSON.stringify(ptyManager.buffer(info.id).slice(-600))}`,
          );
          ptyManager.kill(info.id);
          setTimeout(() => {
            const stillThere = ptyManager.list().some((s) => s.id === info.id);
            log(`SELFTEST: dev killed removed=${!stillThere}`);
            resolvePromise(true);
          }, 4000);
          return;
        }
        if (Date.now() > deadline) {
          log(`SELFTEST: dev:full timeout — tail=${JSON.stringify(ptyManager.buffer(info.id).slice(-400))}`);
          ptyManager.kill(info.id);
          resolvePromise(false);
          return;
        }
        setTimeout(() => void poll(), 2500);
      };
      void poll();
    });
    void devOk;

    if (process.env.MASARFLOW_LAUNCHER_SELFTEST_PROD === "1") {
      // 4. Production: pnpm run build → pnpm start → port 3000 → kill.
      const buildOk = await new Promise<boolean>((resolvePromise) => {
        const info = ptyManager.start({
          label: "selftest build",
          kind: "build",
          command: "pnpm run build",
          file: "cmd.exe",
          args: ["/c", "pnpm run build"],
          cwd: targetDir,
        });
        const onExit = (p: SessionExitPayload): void => {
          if (p.id !== info.id) return;
          ptyManager.removeListener("exit", onExit);
          log(`SELFTEST: build exit=${p.exitCode}`);
          resolvePromise(p.exitCode === 0);
        };
        ptyManager.on("exit", onExit);
        setTimeout(() => {
          log("SELFTEST: build timeout");
          ptyManager.kill(info.id);
          resolvePromise(false);
        }, 15 * 60_000);
      });
      log(`SELFTEST: buildOk=${buildOk}`);

      const prodOk = await new Promise<boolean>((resolvePromise) => {
        if (!buildOk) return resolvePromise(false);
        const info = ptyManager.start({
          label: "selftest prod",
          kind: "run",
          command: "pnpm start",
          file: "cmd.exe",
          args: ["/c", "pnpm start"],
          cwd: targetDir,
        });
        const deadline = Date.now() + 240_000;
        const poll = async (): Promise<void> => {
          const reached = await (async () => {
            try {
              await fetch("http://127.0.0.1:3000", { signal: AbortSignal.timeout(1500) });
              return true;
            } catch {
              return false;
            }
          })();
          if (reached) {
            log(`SELFTEST: prod reached :3000 tail=${JSON.stringify(ptyManager.buffer(info.id).slice(-300))}`);
            ptyManager.kill(info.id);
            setTimeout(() => {
              log(`SELFTEST: prod killed removed=${!ptyManager.list().some((s) => s.id === info.id)}`);
              resolvePromise(true);
            }, 4000);
            return;
          }
          if (Date.now() > deadline) {
            log(`SELFTEST: prod timeout — tail=${JSON.stringify(ptyManager.buffer(info.id).slice(-300))}`);
            ptyManager.kill(info.id);
            resolvePromise(false);
            return;
          }
          setTimeout(() => void poll(), 2500);
        };
        void poll();
      });
      log(`SELFTEST: prodOk=${prodOk}`);
    }

    log("SELFTEST: done");
    app.exit(0);
  })();
}
