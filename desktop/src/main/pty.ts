import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import * as pty from "node-pty";
import type {
  SessionExitPayload,
  SessionInfo,
  SessionKind,
  SessionOutputPayload,
  StartSessionRequest,
} from "@shared/types";

/** Max characters kept per session for re-attach. */
const RING_LIMIT = 400_000;

interface ManagedSession {
  pty: pty.IPty;
  info: SessionInfo;
  buffer: string;
}

export interface SessionEvents {
  output: [SessionOutputPayload];
  exit: [SessionExitPayload];
  changed: [SessionInfo];
}

class PtyManager extends EventEmitter<SessionEvents> {
  private sessions = new Map<string, ManagedSession>();

  private constructor() {
    super();
  }

  private static instance: PtyManager;
  static get(): PtyManager {
    if (!this.instance) this.instance = new PtyManager();
    return this.instance;
  }

  list(): SessionInfo[] {
    return [...this.sessions.values()]
      .map((s) => ({ ...s.info }))
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  get(id: string): SessionInfo | undefined {
    const s = this.sessions.get(id);
    return s ? { ...s.info } : undefined;
  }

  buffer(id: string): string {
    return this.sessions.get(id)?.buffer ?? "";
  }

  /** Kill every managed session (app quit / new run session). */
  killAll(): void {
    for (const id of [...this.sessions.keys()]) this.kill(id);
  }

  /** Kill the session that is currently running as the given kind, if any. */
  killKind(kind: SessionKind): string | null {
    for (const [, s] of this.sessions) {
      if (s.info.kind === kind && s.info.status === "running") {
        const id = s.info.id;
        this.kill(id);
        return id;
      }
    }
    return null;
  }

  start(req: StartSessionRequest, defaultCols = 120, defaultRows = 30): SessionInfo {
    const id = randomUUID();
    const info: SessionInfo = {
      id,
      label: req.label,
      kind: req.kind,
      command: req.command,
      cwd: req.cwd,
      status: "running",
      exitCode: null,
      createdAt: Date.now(),
    };
    const child = pty.spawn(req.file, req.args, {
      name: "xterm-256color",
      cols: defaultCols,
      rows: defaultRows,
      cwd: req.cwd,
      env: { ...process.env, ...req.env },
      useConpty: process.platform === "win32",
    });
    const managed: ManagedSession = { pty: child, info, buffer: "" };
    this.sessions.set(id, managed);

    child.onData((data) => {
      const text = typeof data === "string" ? data : Buffer.from(data).toString("utf8");
      managed.buffer = (managed.buffer + text).slice(-RING_LIMIT);
      this.emit("output", { id, data: text });
    });

    child.onExit(({ exitCode }) => {
      managed.info.status = "exited";
      managed.info.exitCode = exitCode;
      this.emit("exit", { id, exitCode });
      this.emit("changed", { ...managed.info });
    });

    this.emit("changed", { ...info });
    return { ...info };
  }

  write(id: string, data: string): void {
    const s = this.sessions.get(id);
    if (s && s.info.status === "running") {
      try {
        s.pty.write(data);
      } catch {
        // pty already destroyed
      }
    }
  }

  resize(id: string, cols: number, rows: number): void {
    const s = this.sessions.get(id);
    if (!s || s.info.status !== "running") return;
    const c = Math.max(2, Math.floor(cols));
    const r = Math.max(2, Math.floor(rows));
    try {
      s.pty.resize(c, r);
    } catch {
      // ignore
    }
  }

  kill(id: string): void {
    const s = this.sessions.get(id);
    if (!s) return;
    if (s.info.status === "running") {
      if (process.platform === "win32") {
        // Taskkill with /T kills the whole process tree (npm → node → children).
        try {
          execFile("taskkill", ["/pid", String(s.pty.pid), "/T", "/F"]);
        } catch {
          // fall through to pty.kill
        }
      }
      try {
        s.pty.kill();
      } catch {
        // already gone
      }
    }
    this.sessions.delete(id);
    this.emit("changed", { ...s.info, status: "exited" });
  }
}

export const ptyManager = PtyManager.get();
