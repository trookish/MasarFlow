import { execFile } from "node:child_process";
import * as fs from "node:fs";
import { resolveInsideRoot, readJsonBody, fail } from "../_shared";

// Run a shell command inside a linked project root. Reached only after
// explicit per-command user approval on the client. Output is captured
// (stdout + stderr), size-capped, and the process is killed on timeout.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TIMEOUT_MS = 120_000;
const MAX_OUTPUT = 64 * 1024;

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await readJsonBody(req);
    const root = String(body.root ?? "");
    const command = String(body.command ?? "").trim();
    const timeoutMs = Math.min(
      Math.max(Number(body.timeoutMs ?? 30_000), 1000),
      MAX_TIMEOUT_MS,
    );
    if (!command) throw { status: 400, message: "Missing command" };

    const cwd = resolveInsideRoot(root, "");
    const stat = await fs.promises.stat(cwd).catch(() => null);
    if (!stat?.isDirectory()) {
      throw { status: 404, message: "Linked project root is not a directory" };
    }

    const started = Date.now();
    const result = await new Promise<{
      exitCode: number | null;
      stdout: string;
      stderr: string;
      timedOut: boolean;
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
          });
        },
      );
      child.on("error", (e) =>
        resolve({
          exitCode: null,
          stdout: "",
          stderr: e.message,
          timedOut: false,
        }),
      );
    });

    return Response.json({
      ok: result.exitCode === 0 && !result.timedOut,
      ...result,
      durationMs: Date.now() - started,
    });
  } catch (e) {
    return fail(e);
  }
}
