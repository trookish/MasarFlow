import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { normalizeRoot, parseRoots } from "@shared/roots";

export function readRootsFile(file: string): string[] {
  try {
    return parseRoots(readFileSync(file, "utf8"));
  } catch {
    return [];
  }
}

/** Register a folder the user picked. Atomic write so the server never reads a torn file. */
export function addRootToFile(file: string, dir: string): string[] {
  const roots = readRootsFile(file);
  if (!roots.some((r) => normalizeRoot(r) === normalizeRoot(dir))) roots.push(dir);
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify({ roots }, null, 2), "utf8");
  renameSync(tmp, file);
  return roots;
}
