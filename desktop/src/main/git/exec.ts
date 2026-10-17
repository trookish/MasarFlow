import { execFile } from "node:child_process";
import { GIT_MAX_OUTPUT, type GitExec, type GitRawRun } from "./run";

/**
 * The only file in P6 that spawns a process. `execFile` with an argv array —
 * never a shell string — so a path or commit message can never be interpreted
 * as a command. Environment notes (all verified with the real Node runtime):
 *  - GIT_TERMINAL_PROMPT=0 → no credential prompt can ever block a call;
 *  - LC_ALL=C → stable English messages for the failure classifier
 *    (a UTF-8 commit message still round-trips byte-exact — measured);
 *  - options.killed is the timeout signal; code stays null in that case.
 */
export function createExecGit(defaultBinary = "git"): GitExec {
  return (inv) =>
    new Promise<GitRawRun>((resolve) => {
      execFile(
        inv.binary || defaultBinary,
        inv.args,
        {
          cwd: inv.cwd,
          timeout: inv.timeoutMs,
          maxBuffer: GIT_MAX_OUTPUT,
          windowsHide: true,
          encoding: "utf8",
          env: {
            ...process.env,
            GIT_TERMINAL_PROMPT: "0",
            GIT_OPTIONAL_LOCKS: "0",
            LC_ALL: "C",
          },
        },
        (error, stdout, stderr) => {
          const err = error as (NodeJS.ErrnoException & { killed?: boolean }) | null;
          const code = err ? (typeof err.code === "number" ? err.code : null) : 0;
          resolve({
            code,
            stdout: typeof stdout === "string" ? stdout : String(stdout ?? ""),
            stderr: typeof stderr === "string" ? stderr : String(stderr ?? ""),
            timedOut: Boolean(err?.killed) || err?.code === "ETIMEDOUT",
            errno: typeof err?.code === "string" ? err.code : undefined,
          });
        },
      );
    });
}
