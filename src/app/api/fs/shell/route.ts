import { execFile } from "node:child_process";
import * as fs from "node:fs";
import {
  resolveInsideRoot,
  readJsonBody,
  fail,
  fsRequestId,
  logFs,
} from "../_shared";

// Run a shell command inside a linked project root. Reached only after
// explicit per-command user approval on the client. Output is captured
// (stdout + stderr), size-capped, the process is killed on timeout — and it
// is killed immediately when the client aborts the request (Stop pressed or
// the tab closed), so no orphaned shell processes outlive their agent run.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TIMEOUT_MS = 120_000;
const MAX_OUTPUT = 64 * 1024;

export async function POST(req: Request): Promise<Response> {
  const startedAt = Date.now();
  try {
    const body = await readJsonBody(req);
    const requestId = fsRequestId(body);
    const root = String(body.root ?? "");
    const command = String(body.command ?? "").trim();
    const timeoutMs = Math.min(
      Math.max(Number(body.timeoutMs ?? 30_000), 1000),
      MAX_TIMEOUT_MS,
    );
    if (!command) throw { status: 400, message: "Missing command" };
    console.log(
      `[fs:${requestId}] shell started`,
      JSON.stringify({ command: command.slice(0, 200), timeoutMs }),
    );

    const cwd = resolveInsideRoot(root, "");
    const stat = await fs.promises.stat(cwd).catch(() => null);
    if (!stat?.isDirectory()) {
      throw { status: 404, message: "Linked project root is not a directory" };
    }

    const result = await new Promise<{
      exitCode: number | null;
      stdout: string;
      stderr: string;
      timedOut: boolean;
      aborted: boolean;
    }>((resolve) => {
      const shell = process.platform === "win32" ? "cmd.exe" : "/bin/sh";
      const args =
        process.platform === "win32"
          ? ["/d", "/s", "/c", command]
          : ["-lc", command];
      const child = execFile(
        shell,
        args,
        {
          cwd,
          timeout: timeoutMs,
          maxBuffer: MAX_OUTPUT * 2,
          windowsHide: true,
        },
        (error, stdout, stderr) => {
          const timedOut = Boolean(
            error && (error as { killed?: boolean }).killed,
          );
          resolve({
            exitCode:
              typeof (error as { code?: unknown } | null)?.code === "number"
                ? ((error as { code?: number }).code ?? null)
                : error
                  ? null
                  : 0,
            stdout: String(stdout).slice(-MAX_OUTPUT),
            stderr: String(stderr).slice(-MAX_OUTPUT),
            timedOut,
            aborted: req.signal?.aborted ?? false,
          });
        },
      );
      // The client went away (Stop / thread switch / closed tab): kill the
      // child immediately so nothing keeps running in the background.
      req.signal?.addEventListener("abort", () => child.kill(), { once: true });
      child.on("error", (e) =>
        resolve({
          exitCode: null,
          stdout: "",
          stderr: e.message,
          timedOut: false,
          aborted: req.signal?.aborted ?? false,
        }),
      );
    });

    if (result.aborted) {
      logFs("shell", requestId, body, startedAt, {
        ok: false,
        error: "Aborted by the client",
        status: 499,
      });
      return Response.json(
        { ok: false, error: "The command was cancelled." },
        { status: 499 },
      );
    }
    logFs("shell", requestId, body, startedAt, {
      ok: result.exitCode === 0 && !result.timedOut,
      error:
        result.exitCode === 0
          ? result.timedOut
            ? "Timed out"
            : undefined
          : `exit ${result.exitCode ?? "signal"}`,
    });
    return Response.json({
      ok: result.exitCode === 0 && !result.timedOut,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      timedOut: result.timedOut,
      durationMs: Date.now() - startedAt,
    });
  } catch (e) {
    const err = e as { status?: number; message?: string };
    logFs("shell", "unknown", {}, startedAt, {
      ok: false,
      error: err?.message ?? "failed",
      status: err?.status ?? 500,
    });
    return fail(e);
  }
}
