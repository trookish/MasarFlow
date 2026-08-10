import type { LinkedProject } from "@/lib/db/schema";
import { devLogsRepo } from "@/lib/db/repos";
import type { WorkspaceToolDef, ToolCallRequest } from "./tools";

/**
 * Filesystem & shell tools for the agentic chat — opencode-style agency over
 * external project folders the user explicitly linked to the workspace
 * project (e.g. a web app, a Unity game, or a desktop tool sitting next to
 * its notes/specs/docs).
 *
 * Execution calls the sandboxed /api/fs/* routes (every path re-validated
 * server-side against the linked root). Reads are free; `fs_write` and
 * `shell_run` are SENSITIVE — the executor pauses for explicit user approval
 * via `requestApproval` before touching the API.
 */

const str = (description: string) => ({ type: "string", description });
const num = (description: string) => ({ type: "number", description });
const rootParam = {
  root: str(
    "Linked project to operate on: its name or absolute root path. Omit to use the first linked project.",
  ),
};

export const FS_TOOLS: WorkspaceToolDef[] = [
  {
    name: "fs_list",
    description:
      "List the directory tree of a linked external project (files and folders, depth-capped). Use first to orient yourself in the codebase.",
    parameters: {
      type: "object",
      properties: {
        ...rootParam,
        path: str(
          "Subdirectory to list, relative to the root (default: root).",
        ),
        depth: num("Tree depth, 0–6 (default 2)."),
      },
    },
  },
  {
    name: "fs_read",
    description:
      "Read a text file from a linked external project. Returns the content (truncated if large). Binary files are refused.",
    parameters: {
      type: "object",
      properties: {
        ...rootParam,
        path: str("File path relative to the project root."),
        maxBytes: num("Max bytes to read (default 24576)."),
      },
      required: ["path"],
    },
  },
  {
    name: "fs_search",
    description:
      "Search a linked external project for a filename or text content. Returns matching files with line context.",
    parameters: {
      type: "object",
      properties: {
        ...rootParam,
        query: str("Text to search for (case-insensitive)."),
        maxResults: num("Max files to return (default 40)."),
      },
      required: ["query"],
    },
  },
  {
    name: "fs_write",
    description:
      "Create or overwrite a UTF-8 text file in a linked external project. REQUIRES USER APPROVAL — the user reviews the path and content before anything is written. Always read the existing file first when overwriting.",
    parameters: {
      type: "object",
      properties: {
        ...rootParam,
        path: str("File path relative to the project root."),
        content: str("The full new file content."),
      },
      required: ["path", "content"],
    },
  },
  {
    name: "shell_run",
    description:
      "Run a shell command in a linked external project (builds, tests, git, package managers, engine or build CLIs — npm, cargo, gradle, Unity, etc.). REQUIRES USER APPROVAL per command. Output is captured and returned (stdout/stderr, capped).",
    parameters: {
      type: "object",
      properties: {
        ...rootParam,
        command: str("The shell command to run in the project root."),
        timeoutMs: num("Timeout in ms, max 120000 (default 30000)."),
      },
      required: ["command"],
    },
  },
];

export const FS_TOOL_NAMES = new Set(FS_TOOLS.map((t) => t.name));

/** Tools that touch the machine — user approval required before execution. */
export const SENSITIVE_FS_TOOLS = new Set(["fs_write", "shell_run"]);

export interface ApprovalRequest {
  name: string;
  arguments: Record<string, unknown>;
  /** Display label of the linked root the action targets. */
  rootLabel: string;
}

export interface FsToolContext {
  roots: LinkedProject[];
  /** Pause for the user's decision. Must resolve true (allow) / false (deny). */
  requestApproval: (req: ApprovalRequest) => Promise<boolean>;
  /**
   * Cancellation signal for the enclosing agent run. While set, an in-flight
   * approval (or fs/shell fetch) aborts promptly instead of leaving the agent
   * loop suspended — a Stop press must never hang the turn.
   */
  signal?: AbortSignal;
  /** Correlates this tool's server-side execution with the agent run. */
  requestId?: string;
}

/** Cap tool-result size so a big file/command can't flood the context. */
const RESULT_CAP = 16_000;

function cap(text: string): string {
  if (text.length <= RESULT_CAP) return text;
  const head = text.slice(0, Math.floor(RESULT_CAP * 0.7));
  const tail = text.slice(-Math.floor(RESULT_CAP * 0.2));
  return `${head}\n\n… [${text.length - head.length - tail.length} chars omitted] …\n\n${tail}`;
}

function resolveRoot(
  roots: LinkedProject[],
  ref: unknown,
): LinkedProject | { error: string } {
  if (!roots.length) {
    return {
      error:
        "No external project is linked to this workspace project. The user can link one from the chat header (folder icon).",
    };
  }
  const r = typeof ref === "string" && ref.trim() ? ref.trim() : null;
  if (!r) return roots[0];
  const found = roots.find(
    (p) =>
      p.name.toLowerCase() === r.toLowerCase() ||
      p.rootPath === r ||
      p.rootPath.toLowerCase().endsWith(r.toLowerCase()),
  );
  return (
    found ?? {
      error: `No linked project matches "${r}". Available: ${roots.map((p) => p.name).join(", ")}.`,
    }
  );
}

async function postFs(
  op: string,
  payload: Record<string, unknown>,
  signal?: AbortSignal,
) {
  const res = await fetch(`/api/fs/${op}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  const json = (await res.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!res.ok) {
    return {
      ok: false,
      error: String(json?.error ?? `fs/${op} failed (${res.status})`),
    };
  }
  return json ?? { ok: true };
}

/**
 * Execute one filesystem/shell tool call against the linked roots.
 * Returns a JSON string result (the convention shared with workspace tools).
 */
export async function executeFsTool(
  ctx: FsToolContext,
  call: ToolCallRequest,
): Promise<string> {
  const root = resolveRoot(ctx.roots, call.arguments.root);
  if ("error" in root) return JSON.stringify({ ok: false, error: root.error });
  const args = { ...call.arguments };
  delete args.root;

  if (SENSITIVE_FS_TOOLS.has(call.name)) {
    // Wait for the user's decision, but never hang the agent on it: an
    // aborted run (Stop, thread switch, unmount) settles the approval as a
    // denial so the loop can wind down immediately.
    let allowed = false;
    if (ctx.signal?.aborted) return cancelledResult();
    try {
      allowed = await Promise.race([
        ctx.requestApproval({
          name: call.name,
          arguments: args,
          rootLabel: `${root.name} (${root.rootPath})`,
        }),
        ctx.signal
          ? new Promise<boolean>((resolve) =>
              ctx.signal!.addEventListener("abort", () => resolve(false), {
                once: true,
              }),
            )
          : never(),
      ]);
    } catch {
      return cancelledResult();
    }
    if (!allowed) {
      return JSON.stringify({
        ok: false,
        error: ctx.signal?.aborted
          ? "The action was cancelled."
          : "The user denied this action. Do not retry it — ask how to proceed.",
      });
    }
  }

  const op =
    call.name === "fs_list"
      ? "list"
      : call.name === "fs_read"
        ? "read"
        : call.name === "fs_search"
          ? "search"
          : call.name === "fs_write"
            ? "write"
            : call.name === "shell_run"
              ? "shell"
              : null;
  if (!op)
    return JSON.stringify({ ok: false, error: `Unknown tool: ${call.name}` });

  try {
    const result = await postFs(
      op,
      { root: root.rootPath, ...args, requestId: ctx.requestId },
      ctx.signal,
    );
    // Log machine-touching actions so the trail is visible in Dev Logs.
    if (SENSITIVE_FS_TOOLS.has(call.name) && result.ok !== false) {
      const detail =
        call.name === "shell_run"
          ? String(args.command ?? "")
          : String(args.path ?? "");
      void devLogsRepo
        .create({
          projectId: root.projectId,
          type: "change",
          title: `AI ${call.name === "shell_run" ? "ran" : "wrote"}: ${detail.slice(0, 80)}`,
          body: `Tool \`${call.name}\` on linked project ${root.name} (\`${root.rootPath}\`).`,
        })
        .catch(() => {
          /* best-effort trail — never break the tool result */
        });
    }
    return JSON.stringify(result, (_k, v: unknown) =>
      typeof v === "string" && v.length > RESULT_CAP ? cap(v) : v,
    );
  } catch (e) {
    if (ctx.signal?.aborted) return cancelledResult();
    return JSON.stringify({ ok: false, error: (e as Error).message });
  }
}

const never = () => new Promise<boolean>(() => {});

function cancelledResult(): string {
  return JSON.stringify({ ok: false, error: "The action was cancelled." });
}
