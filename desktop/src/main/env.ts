import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { copyFileSync } from "node:fs";
import { join } from "node:path";
import type { EnvData, EnvField, EnvFieldKind } from "@shared/types";

const KNOWN_FIELDS: Record<string, { description: string; kind: EnvFieldKind }> = {
  PYTHON_SERVICE_URL: {
    description: "Base URL of the local Python AI service. The workspace shell waits until this is healthy.",
    kind: "url",
  },
  OPENCODE_BASE_URL: {
    description: "Base URL of the OpenCode server (chat agent backend). Overridden with the port actually bound.",
    kind: "url",
  },
  OPENCODE_USERNAME: {
    description: "Username the backend uses to authenticate to the OpenCode server (HTTP basic auth).",
    kind: "secret",
  },
  OPENCODE_PASSWORD: {
    description: "Password for the OpenCode server client credentials.",
    kind: "secret",
  },
  OPENCODE_SERVER_USERNAME: {
    description: "Auth applied to the server spawned by the launcher (falls back to OPENCODE_USERNAME).",
    kind: "text",
  },
  OPENCODE_SERVER_PASSWORD: {
    description: "Auth applied to the spawned OpenCode server (falls back to OPENCODE_PASSWORD).",
    kind: "secret",
  },
  OPENCODE_AUTO_START: {
    description: "Spawn the OpenCode server from the launcher when nothing is reachable at OPENCODE_BASE_URL.",
    kind: "boolean",
  },
  OPENCODE_PORT: {
    description: "Preferred port for the spawned OpenCode server (falls forward when occupied).",
    kind: "port",
  },
  OPENCODE_WORKSPACE_DIR: {
    description: "Default working directory for OpenCode sessions. Defaults to the MasarFlow project root.",
    kind: "path",
  },
  OPENCODE_PERMISSION_EDIT: {
    description: "Per-session tool permission rule for file edits (ask | allow | deny).",
    kind: "text",
  },
  OPENCODE_PERMISSION_BASH: {
    description: "Per-session tool permission rule for shell commands (ask | allow | deny).",
    kind: "text",
  },
  OPENCODE_PERMISSION_WEBFETCH: {
    description: "Per-session tool permission rule for web fetches (ask | allow | deny).",
    kind: "text",
  },
  MASARFLOW_OPENCODE_FIRST_EVENT_TIMEOUT_MS: {
    description: "Time before the first event in a chat turn (milliseconds).",
    kind: "ms",
  },
  MASARFLOW_OPENCODE_IDLE_TIMEOUT_MS: {
    description: "Silence between events before a turn is aborted (milliseconds).",
    kind: "ms",
  },
  MASARFLOW_OPENCODE_TOTAL_TIMEOUT_MS: {
    description: "Whole turn budget (milliseconds).",
    kind: "ms",
  },
  OPENCODE_MODEL_CACHE_TTL_MS: {
    description: "Cache TTL for the provider/model catalog fetched from OpenCode (milliseconds).",
    kind: "ms",
  },
  PORT: {
    description: "Port the Next.js app runs on (default 3000).",
    kind: "port",
  },
};

export interface ParsedLine {
  comment: string[];
  key?: string;
  value?: string;
  active: boolean;
}

export function parseLines(content: string): ParsedLine[] {
  const lines: ParsedLine[] = [];
  let pendingComments: string[] = [];
  for (const raw of content.split(/\r?\n/)) {
    const line = raw;
    if (line.trim() === "") {
      lines.push({ comment: pendingComments, active: true });
      pendingComments = [];
      continue;
    }
    if (line.trimStart().startsWith("#")) {
      pendingComments.push(line.trimStart().slice(1).trim());
      continue;
    }
    const eq = line.indexOf("=");
    if (eq === -1) {
      lines.push({ comment: pendingComments, active: true, key: line.trim() });
      pendingComments = [];
      continue;
    }
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    lines.push({ comment: pendingComments, key, value, active: true });
    pendingComments = [];
  }
  if (pendingComments.length) {
    lines.push({ comment: pendingComments, active: true });
  }
  return lines;
}

export function parseEnv(content: string): EnvField[] {
  return parseLines(content)
    .filter((l) => l.key)
    .map((l) => {
      const meta = KNOWN_FIELDS[l.key!] ?? {
        description: "",
        kind: "text" as EnvFieldKind,
      };
      return {
        key: l.key!,
        value: l.value ?? "",
        active: l.active,
        description: meta.description,
        kind: meta.kind,
      };
    });
}

export function serializeFields(fields: EnvField[]): string {
  return fields
    .map((f) => {
      const header = f.description ? `# ${f.description}` : "";
      const body = f.active ? `${f.key}=${f.value}` : `# ${f.key}=${f.value}`;
      return header ? `${header}\n${body}` : body;
    })
    .join("\n\n") + "\n";
}

export function readEnv(targetDir: string): EnvData {
  const file = join(targetDir, ".env.local");
  const content = existsSync(file) ? readFileSync(file, "utf8") : "";
  return { path: file, content, fields: parseEnv(content) };
}

export function saveEnv(targetDir: string, content: string): { ok: boolean; error?: string } {
  const file = join(targetDir, ".env.local");
  try {
    if (!existsSync(file)) {
      const example = join(targetDir, ".env.local.example");
      if (existsSync(example)) copyFileSync(example, file);
    }
    const backup = join(targetDir, ".env.local.bak");
    if (!existsSync(backup) && existsSync(file)) copyFileSync(file, backup);
    writeFileSync(file, content, "utf8");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Port numbers currently in use by MasarFlow services (from .env.local). */
export function servicePorts(targetDir: string): { appPort: number; pythonPort: number } {
  let appPort = 3000;
  let pythonPort = 8000;
  const data = readEnv(targetDir);
  for (const f of data.fields) {
    if (!f.active || !f.value) continue;
    if (f.key === "PORT") {
      const p = Number(f.value);
      if (Number.isFinite(p) && p > 0) appPort = p;
    }
    if (f.key === "PYTHON_SERVICE_URL") {
      try {
        const p = Number(new URL(f.value).port);
        if (Number.isFinite(p) && p > 0) pythonPort = p;
      } catch {
        // keep default
      }
    }
  }
  return { appPort, pythonPort };
}

/**
 * Ports a live MasarFlow run actually bound to, as published by
 * scripts/start.mjs. The launcher spawns `npm run dev:full` / `npm start`,
 * which shift ports forward when stale listeners squat the configured ones —
 * polling the configured ports would keep the chips red forever.
 */
export function runPorts(targetDir: string): { appPort: number; pythonPort: number } | null {
  try {
    const file = join(targetDir, ".masarflow", "run-ports.json");
    const raw = JSON.parse(readFileSync(file, "utf8")) as {
      pid?: number;
      app?: number;
      python?: number;
    };
    if (!raw || typeof raw.app !== "number" || typeof raw.python !== "number") {
      return null;
    }
    // A force-killed run (taskkill /F) leaves the file behind without its
    // exit hooks — only trust it while the writer process is still alive.
    if (typeof raw.pid === "number") {
      try {
        process.kill(raw.pid, 0);
      } catch {
        return null;
      }
    }
    return { appPort: raw.app, pythonPort: raw.python };
  } catch {
    return null;
  }
}

/** The ports the launcher should poll/open: a live run's real ports when
 *  known, otherwise the configured ones from .env.local. */
export function effectivePorts(targetDir: string): { appPort: number; pythonPort: number } {
  return runPorts(targetDir) ?? servicePorts(targetDir);
}

/** Drop a stale ports file (e.g. right after the launcher stops a run). */
export function clearRunPorts(targetDir: string): void {
  try {
    const file = join(targetDir, ".masarflow", "run-ports.json");
    if (existsSync(file)) {
      const raw = JSON.parse(readFileSync(file, "utf8")) as { pid?: number };
      // Only remove files from a dead run — never one a live run still owns.
      if (typeof raw.pid === "number") {
        try {
          process.kill(raw.pid, 0);
          return;
        } catch {
          // pid is dead — safe to remove
        }
      }
      unlinkSync(file);
    }
  } catch {
    // best effort
  }
}
