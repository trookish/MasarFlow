import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { isRootAllowed, parseRoots } from "@desktop-shared/roots";

let cache: { file: string; mtimeMs: number; roots: string[] } | null = null;

function loadRoots(dataDir: string): string[] {
  const file = join(dataDir, "roots.json");
  try {
    const { mtimeMs } = statSync(file);
    if (cache && cache.file === file && cache.mtimeMs === mtimeMs) return cache.roots;
    const roots = parseRoots(readFileSync(file, "utf8"));
    cache = { file, mtimeMs, roots };
    return roots;
  } catch {
    return [];
  }
}

/** Folders allowed in browser development: `MASARFLOW_DEV_ROOTS`, separated by `;`. */
export function devRoots(env: Record<string, string | undefined>): string[] {
  return (env.MASARFLOW_DEV_ROOTS ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Throws `{status:403}` unless `root` is allowed. Fails closed in every mode:
 * - desktop app (MASARFLOW_DATA_DIR set): only folders registered through the native folder picker;
 * - browser development: only folders listed in MASARFLOW_DEV_ROOTS.
 */
export function assertRootAllowed(root: string, env: Record<string, string | undefined> = process.env): void {
  const dataDir = env.MASARFLOW_DATA_DIR?.trim();
  if (!dataDir) {
    const roots = devRoots(env);
    if (roots.length === 0) {
      throw {
        status: 403,
        message: "No folders are linked. Set MASARFLOW_DEV_ROOTS for browser development, or use the desktop app.",
      };
    }
    if (!isRootAllowed(root, roots)) {
      throw { status: 403, message: "This folder is not listed in MASARFLOW_DEV_ROOTS." };
    }
    return;
  }
  if (!isRootAllowed(root, loadRoots(dataDir))) {
    throw {
      status: 403,
      message: "This folder has not been linked on this computer. Choose it again with the folder picker.",
    };
  }
}
