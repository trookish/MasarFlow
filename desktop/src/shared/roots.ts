import { posix, win32 } from "node:path";

const mod = (platform: NodeJS.Platform) => (platform === "win32" ? win32 : posix);

/** Canonical form used for comparing roots: absolute, no trailing separator, case-folded on Windows. */
export function normalizeRoot(p: string, platform: NodeJS.Platform = process.platform): string {
  const resolved = mod(platform).resolve(p);
  return platform === "win32" ? resolved.toLowerCase() : resolved;
}

/** True when `root` equals a registered root or lies inside one. */
export function isRootAllowed(root: string, roots: string[], platform: NodeJS.Platform = process.platform): boolean {
  const m = mod(platform);
  const target = normalizeRoot(root, platform);
  return roots.some((r) => {
    const base = normalizeRoot(r, platform);
    if (target === base) return true;
    const rel = m.relative(base, target);
    return rel !== "" && !rel.startsWith("..") && !m.isAbsolute(rel);
  });
}

export function parseRoots(raw: string): string[] {
  try {
    const data = JSON.parse(raw) as { roots?: unknown };
    return Array.isArray(data.roots) ? data.roots.filter((r): r is string => typeof r === "string") : [];
  } catch {
    return [];
  }
}
