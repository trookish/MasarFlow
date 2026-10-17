import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Temp dirs live under the host scratch directory (never /tmp).
 * Override with MASARFLOW_SCRATCH on another machine.
 */
export const SCRATCH_ROOT =
  process.env.MASARFLOW_SCRATCH ??
  process.env.TMPDIR ??
  "C:/Users/trookish/AppData/Local/hermes/cache/scratch";

export function scratchDir(label: string): string {
  fs.mkdirSync(SCRATCH_ROOT, { recursive: true });
  return fs.mkdtempSync(path.join(SCRATCH_ROOT, `masarflow-${label}-`));
}

export function removeDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

export const tmpExists = (dir: string): boolean => fs.existsSync(dir);
export const tmpRead = (dir: string, rel: string): string => fs.readFileSync(path.join(dir, rel), "utf8");
export const tmpList = (dir: string): string[] => {
  const out: string[] = [];
  const walk = (base: string): void => {
    for (const e of fs.readdirSync(base, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const full = path.join(base, e.name);
      if (e.isDirectory()) walk(full);
      else out.push(path.relative(dir, full).split(path.sep).join("/"));
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out.sort();
};
