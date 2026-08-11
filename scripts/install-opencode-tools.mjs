#!/usr/bin/env node
/**
 * Installs MasarFlow's workspace functions as opencode custom tools.
 *
 * Generates one `.opencode/tools/*.ts` file per workspace function
 * (create_note, read_spec, …) and writes them to:
 *   - the project's `<workspaceDir>/.opencode/tools/` directory, and
 *   - the global `~/.config/opencode/tools/` directory (set
 *     OPENCODE_TOOLS_GLOBAL=false to skip the global install).
 *
 * opencode discovers these files when its server starts and registers them
 * as real tools; each tool calls back into MasarFlow's server
 * (/api/opencode/ws-call), which relays the call to the open browser over
 * SSE — the browser executes the function against IndexedDB.
 *
 * `scripts/start.mjs` calls installOpencodeTools() automatically before
 * spawning `opencode serve` (so it always has the current tool set). Run it
 * manually (`npm run tools:install`) after starting your own opencode server
 * — then RESTART the server so it picks the tools up.
 *
 * The generated tool files use Node's built-in TypeScript type stripping —
 * they load the tool definitions directly from
 * src/lib/ai/workspace-tool-defs.ts (Node 22.6+).
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function nodeSupportsTypescript() {
  const [major, minor] = process.versions.node
    .split(".")
    .map((n) => Number(n) || 0);
  return major > 22 || (major === 22 && minor >= 6);
}

/** The shared bridge secret, consistent across the Next server and tools. */
async function resolveSecret() {
  if (process.env.MASARFLOW_BRIDGE_SECRET?.trim()) {
    return process.env.MASARFLOW_BRIDGE_SECRET.trim();
  }
  // Respect a value the user put in .env.local (Next auto-loads it too).
  const envFile = path.join(root, ".env.local");
  if (existsSync(envFile)) {
    try {
      const text = await readFile(envFile, "utf8");
      for (const line of text.split(/\r?\n/)) {
        const m = /^MASARFLOW_BRIDGE_SECRET\s*=\s*(.+)$/.exec(line.trim());
        if (m && m[1].trim()) return m[1].trim();
      }
    } catch {}
  }
  // Persist a generated secret so every restart agrees with Next.
  const secretFile = path.join(root, ".masarflow", "bridge-secret");
  if (existsSync(secretFile)) {
    try {
      const existing = (await readFile(secretFile, "utf8")).trim();
      if (existing) return existing;
    } catch {}
  }
  const secret = `msf_${randomBytes(24).toString("base64url")}`;
  await mkdir(path.dirname(secretFile), { recursive: true });
  await writeFile(secretFile, secret, { encoding: "utf8" });
  return secret;
}

/**
 * One install target: the directory, how many files landed there, and any
 * write error.
 * @typedef {{ dir: string, count: number, error?: string }} InstallResult
 */

/**
 * Generate the workspace-tool files and install them (project-local +
 * global opencode tools dirs). Throws when the project-local install fails
 * (the workspace functions would be unavailable to opencode); global
 * failures are warnings only.
 *
 * @returns {Promise<{ secret: string, bridgeUrl: string, locations: InstallResult[] }>}
 */
export async function installOpencodeTools() {
  if (!nodeSupportsTypescript()) {
    throw new Error(
      "Node.js 22.6+ is required to generate opencode tools (Node's built-in TypeScript support).",
    );
  }
  const { allWorkspaceToolFiles } =
    await import("../src/lib/opencode/toolgen.ts");

  const workspaceDir = process.env.OPENCODE_WORKSPACE_DIR?.trim() || root;
  const bridgeUrl =
    process.env.MASARFLOW_BRIDGE_URL?.trim() ||
    `http://127.0.0.1:${process.env.PORT?.trim() || "3000"}`;
  const secret = await resolveSecret();
  const files = allWorkspaceToolFiles({ bridgeUrl, secret });

  const targets = [path.join(workspaceDir, ".opencode", "tools")];
  if (process.env.OPENCODE_TOOLS_GLOBAL !== "false") {
    targets.push(path.join(os.homedir(), ".config", "opencode", "tools"));
  }

  const locations = [];
  for (const dir of targets) {
    try {
      await mkdir(dir, { recursive: true });
      await Promise.all(
        files.map((f) =>
          writeFile(path.join(dir, `${f.name}.ts`), f.content, {
            encoding: "utf8",
          }),
        ),
      );
      locations.push({ dir, count: files.length });
    } catch (e) {
      locations.push({ dir, count: 0, error: e.message });
    }
  }

  const projectLocal = locations.find((l) => l.dir.startsWith(workspaceDir));
  if (projectLocal?.error) {
    throw new Error(
      `Could not write the workspace tools to ${projectLocal.dir}: ${projectLocal.error}`,
    );
  }
  return { secret, bridgeUrl, locations };
}

/* ── CLI entry (node scripts/install-opencode-tools.mjs) ─────────────── */

async function main() {
  try {
    const { secret, bridgeUrl, locations } = await installOpencodeTools();
    const installed = locations.reduce((n, r) => n + r.count, 0);
    console.log(
      `[tools] installed ${installed} workspace tool file(s) (${locations.length} location(s)).`,
    );
    for (const r of locations) {
      console.log(
        `[tools]   → ${r.dir} (${r.count} file${r.count === 1 ? "" : "s"})`,
      );
    }
    console.log(
      `[tools] bridge: ${bridgeUrl} · secret: ${secret.slice(0, 8)}…`,
    );
    console.log(
      "[tools] restart any running `opencode serve` so it registers the tools.",
    );
  } catch (err) {
    console.error(`[tools] install failed: ${err.message}`);
    process.exit(1);
  }
}

const isCli =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) void main();
