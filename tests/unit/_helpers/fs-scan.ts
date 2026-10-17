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

export interface ScanHit {
  /** Repo-relative path, forward slashes, e.g. "scripts/start.mjs". */
  file: string;
  /** 1-based line number. */
  line: number;
  /** The matching line, trimmed. */
  text: string;
}

/**
 * Search every source file under the given repo-relative roots for `pattern`,
 * one hit per matching line. Paths are repo-relative (forward slashes) so
 * callers can print or whitelist exact files.
 */
export function scanFiles(
  roots: string[],
  pattern: RegExp,
  exts = [".ts", ".tsx", ".mjs", ".js", ".mts", ".cjs"],
): ScanHit[] {
  const hits: ScanHit[] = [];
  for (const root of roots) {
    for (const p of walk(join(REPO_ROOT, root), exts)) {
      const file = p.slice(REPO_ROOT.length).replaceAll("\\", "/");
      const lines = readFileSync(p, "utf8").split("\n");
      lines.forEach((text, i) => {
        if (!text) return;
        // A caller may pass a /g regex — reset so `test` never skips lines.
        pattern.lastIndex = 0;
        if (pattern.test(text)) hits.push({ file, line: i + 1, text: text.trim() });
      });
    }
  }
  return hits;
}
