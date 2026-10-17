import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
export const SRC_DIR = join(REPO_ROOT, "src");

export function* walk(dir: string, exts = [".ts", ".tsx"]): Generator<string> {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      yield* walk(full, exts);
    } else if (exts.some((e) => name.endsWith(e))) {
      yield full;
    }
  }
}

export interface SourceFile {
  /** Repo-relative, forward slashes, e.g. "src/lib/plugins.ts". */
  path: string;
  text: string;
}

export function readSources(dir = SRC_DIR, exts?: string[]): SourceFile[] {
  return [...walk(dir, exts)].map((p) => ({
    path: p.slice(REPO_ROOT.length).replaceAll("\\", "/"),
    text: readFileSync(p, "utf8"),
  }));
}
