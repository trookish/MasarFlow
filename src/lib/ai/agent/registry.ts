import type { WorkspaceToolDef, ToolCallRequest } from "@/lib/ai/tools";
import type { AgentToolKind } from "./types";
import type { AgentLogger } from "./logger";

/**
 * The ToolRegistry: the only way the model reaches Masarflow's capabilities.
 * The LLM can never touch the filesystem or shell directly — it can only
 * request a registered tool by name, and the registry:
 *
 *   1. validates the arguments against the tool's JSON Schema,
 *   2. executes through the host-provided handler (Dexie workspace tools,
 *      sandboxed /api/fs/* tools),
 *   3. never throws for tool failures — errors are returned in the result so
 *      the LLM can decide how to recover,
 *   4. enforces the run's safety counters (shell commands, file writes).
 *
 * Result convention: every tool resolves with a JSON string whose `ok`
 * property is `true` on success and `false` on failure.
 */

export interface ToolCallOutcome {
  ok: boolean;
  content: string;
  durationMs: number;
  /** Set when execution was cut short by the agent's safety limits. */
  limited?: string;
}

export class ToolRegistry {
  private defs = new Map<string, WorkspaceToolDef>();
  private kinds = new Map<string, AgentToolKind>();
  private shellCalls = 0;
  private fileWrites = 0;

  constructor(private readonly log: AgentLogger) {}

  /** Register a tool definition and its safety classification. */
  register(def: WorkspaceToolDef, kind: AgentToolKind = {}): this {
    this.defs.set(def.name, def);
    this.kinds.set(def.name, kind);
    return this;
  }

  /** All registered definitions, for the model's tool payload. */
  definitions(): WorkspaceToolDef[] {
    return [...this.defs.values()];
  }

  get(name: string): WorkspaceToolDef | undefined {
    return this.defs.get(name);
  }

  /** True when the name is registered. */
  has(name: string): boolean {
    return this.defs.has(name);
  }

  /** Shell-command count used by this run so far. */
  get shellCallCount(): number {
    return this.shellCalls;
  }

  /** File-write count used by this run so far. */
  get fileWriteCount(): number {
    return this.fileWrites;
  }

  /**
   * Validate a call's arguments against the tool's declared JSON Schema.
   * Returns an error string, or null when the arguments pass.
   */
  validate(call: ToolCallRequest): string | null {
    const def = this.defs.get(call.name);
    if (!def)
      return `Unknown tool "${call.name}". Pick from the registered tools.`;
    const schema = def.parameters as {
      properties?: Record<string, { type?: string; items?: { type?: string } }>;
      required?: string[];
    };
    const args = call.arguments ?? {};
    if (!schema || typeof schema !== "object") return null;

    const missing = (schema.required ?? []).filter(
      (k) => args[k] === undefined || args[k] === null || args[k] === "",
    );
    if (missing.length) {
      return `Missing required argument(s) for ${call.name}: ${missing.join(", ")}.`;
    }

    for (const [key, spec] of Object.entries(schema.properties ?? {})) {
      const value = args[key];
      if (value === undefined || value === null) continue;
      switch (spec.type) {
        case "string":
          if (typeof value !== "string")
            return `Argument "${key}" of ${call.name} must be a string.`;
          break;
        case "number":
          if (typeof value !== "number" || !Number.isFinite(value))
            return `Argument "${key}" of ${call.name} must be a number.`;
          break;
        case "boolean":
          if (typeof value !== "boolean")
            return `Argument "${key}" of ${call.name} must be a boolean.`;
          break;
        case "array":
          if (!Array.isArray(value))
            return `Argument "${key}" of ${call.name} must be an array.`;
          break;
        case "object":
          if (typeof value !== "object" || Array.isArray(value))
            return `Argument "${key}" of ${call.name} must be an object.`;
          break;
        default:
          break;
      }
    }
    return null;
  }

  /**
   * Check the run's safety counters for this tool. Returns a human-readable
   * limit explanation, or null when the call may proceed.
   */
  checkLimit(
    name: string,
    maxShellCommands: number,
    maxFileModifications: number,
  ): string | null {
    const kind = this.kinds.get(name) ?? {};
    if (kind.shell && this.shellCalls >= maxShellCommands) {
      return `Shell-command limit reached (${maxShellCommands} per run) — stop using shell tools and finish the task with what you already have.`;
    }
    if (kind.modifiesFiles && this.fileWrites >= maxFileModifications) {
      return `File-modification limit reached (${maxFileModifications} per run) — stop writing files and finish the task with what you already have.`;
    }
    return null;
  }

  /**
   * Execute a registered tool call. Never throws: every failure is returned
   * as a JSON result the LLM can see and recover from. The host's handler
   * runs under `signal` so cancellation reaches in-flight tools.
   */
  async execute(
    call: ToolCallRequest,
    opts: {
      signal: AbortSignal;
      run: (call: ToolCallRequest, signal: AbortSignal) => Promise<string>;
      maxToolMs: number;
    },
  ): Promise<ToolCallOutcome> {
    const started = Date.now();
    const kind = this.kinds.get(call.name) ?? {};
    this.log.tool("Execution started", {
      tool: call.name,
      sensitive: Boolean(kind.shell || kind.modifiesFiles),
    });

    if (kind.shell) this.shellCalls += 1;
    if (kind.modifiesFiles) this.fileWrites += 1;

    const finish = (content: string, ok: boolean): ToolCallOutcome => {
      const outcome: ToolCallOutcome = {
        ok,
        content,
        durationMs: Date.now() - started,
      };
      this.log.tool("Execution completed", {
        tool: call.name,
        ok,
        durationMs: outcome.durationMs,
      });
      return outcome;
    };

    // Malformed arguments: refuse before execution, hand the error back.
    const invalid = this.validate(call);
    if (invalid)
      return finish(JSON.stringify({ ok: false, error: invalid }), false);

    try {
      // Execution races the run itself, the per-tool timeout, and the run's
      // cancellation signal — whichever lands first wins, so an aborted agent
      // is never left waiting on a tool that hangs.
      const content = await new Promise<string>((resolve, reject) => {
        let settled = false;
        const settle = (fn: () => void) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          opts.signal.removeEventListener("abort", onAbort);
          fn();
        };
        const timer = setTimeout(
          () =>
            settle(() =>
              reject(
                new Error(
                  `Tool ${call.name} timed out after ${Math.round(opts.maxToolMs / 1000)}s.`,
                ),
              ),
            ),
          opts.maxToolMs,
        );
        const onAbort = () =>
          settle(() => reject(new Error("The tool was aborted.")));
        if (opts.signal.aborted) onAbort();
        else opts.signal.addEventListener("abort", onAbort, { once: true });
        opts.run(call, opts.signal).then(
          (v) => settle(() => resolve(v)),
          (e: unknown) => settle(() => reject(e)),
        );
      });
      let ok = true;
      try {
        ok = (JSON.parse(content) as { ok?: boolean }).ok !== false;
      } catch {
        /* non-JSON results count as ok */
      }
      return finish(content, ok);
    } catch (e) {
      if (opts.signal.aborted) {
        return finish(
          JSON.stringify({ ok: false, error: "The tool was cancelled." }),
          false,
        );
      }
      return finish(
        JSON.stringify({ ok: false, error: (e as Error).message }),
        false,
      );
    }
  }
}
