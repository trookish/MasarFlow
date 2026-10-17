import { utilityProcess } from "electron";
import { createWriteStream, mkdirSync } from "node:fs";
import { join } from "node:path";
import { TOKEN_HEADER } from "@shared/security";
import { findFreePort } from "./ports";
import { createLaunchToken } from "./token";

export interface BackendHandle {
  origin: string;
  port: number;
  token: string;
  stop(): Promise<void>;
}

export interface StartBackendOptions {
  /** Absolute path to the Next standalone server.js. */
  serverEntry: string;
  logDir: string;
  env?: Record<string, string>;
  readyTimeoutMs?: number;
}

/** Fork the Next standalone server on a free loopback port and wait for /api/health. */
export async function startBackend(opts: StartBackendOptions): Promise<BackendHandle> {
  const port = await findFreePort();
  const token = createLaunchToken();
  const origin = `http://127.0.0.1:${port}`;

  mkdirSync(opts.logDir, { recursive: true });
  const log = createWriteStream(join(opts.logDir, "server.log"), { flags: "a" });
  const tail: string[] = [];
  const onData = (chunk: Buffer): void => {
    const text = chunk.toString();
    log.write(text);
    tail.push(...text.split(/\r?\n/).filter(Boolean));
    if (tail.length > 60) tail.splice(0, tail.length - 60);
  };

  const child = utilityProcess.fork(opts.serverEntry, [], {
    serviceName: "masarflow-server",
    stdio: "pipe",
    env: {
      ...(process.env as Record<string, string>),
      ...opts.env,
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      MASARFLOW_TOKEN: token,
    },
  });
  child.stdout?.on("data", onData);
  child.stderr?.on("data", onData);

  let exitCode: number | null = null;
  child.once("exit", (code) => {
    exitCode = code;
  });

  const deadline = Date.now() + (opts.readyTimeoutMs ?? 30_000);
  for (;;) {
    if (exitCode !== null) {
      throw new Error(`Backend exited with code ${exitCode} before it was ready.\n${tail.join("\n")}`);
    }
    if (Date.now() > deadline) {
      child.kill();
      throw new Error(`Backend did not become ready in time.\n${tail.join("\n")}`);
    }
    try {
      const res = await fetch(`${origin}/api/health`, {
        headers: { [TOKEN_HEADER]: token },
        signal: AbortSignal.timeout(1000),
      });
      if (res.ok) break;
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  return {
    origin,
    port,
    token,
    async stop() {
      if (exitCode === null) {
        await new Promise<void>((resolve) => {
          child.once("exit", () => resolve());
          child.kill();
        });
      }
      log.end();
    },
  };
}
