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

/**
 * Throws `{status:403}` unless `root` was registered through the native folder picker.
 * Enforced only when Electron main provided MASARFLOW_DATA_DIR (packaged / desktop mode).
 */
export function assertRootAllowed(root: string, env: Record<string, string | undefined> = process.env): void {
  const dataDir = env.MASARFLOW_DATA_DIR?.trim();
  if (!dataDir) return;
  if (!isRootAllowed(root, loadRoots(dataDir))) {
    throw {
      status: 403,
      message: "This folder has not been linked on this computer. Choose it again with the folder picker.",
    };
  }
}
