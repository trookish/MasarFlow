import type { WatchKind, WatchFileType } from "@/lib/db/schema";

export const WATCH_KINDS: WatchKind[] = ["created", "modified", "deleted"];

export const WATCH_KIND_LABEL: Record<WatchKind, string> = {
  created: "Created",
  modified: "Modified",
  deleted: "Deleted",
};

/** Pill colors per change kind (themeable --node-* tokens). */
export const WATCH_KIND_STYLE: Record<WatchKind, string> = {
  created: "bg-node-lore/15 text-node-lore",
  modified: "bg-node-idea/15 text-node-idea",
  deleted: "bg-node-decision/15 text-node-decision",
};

export const WATCH_FILE_TYPES: WatchFileType[] = [
  "code",
  "asset",
  "scene",
  "shader",
  "config",
  "doc",
  "other",
];

export const WATCH_FILE_TYPE_LABEL: Record<WatchFileType, string> = {
  code: "Code",
  asset: "Asset",
  scene: "Scene",
  shader: "Shader",
  config: "Config",
  doc: "Doc",
  other: "Other",
};

const EXT_TYPE: Record<string, WatchFileType> = {
  // code
  cs: "code", ts: "code", tsx: "code", js: "code", jsx: "code", py: "code",
  cpp: "code", c: "code", h: "code", hpp: "code", rs: "code", go: "code",
  java: "code", rb: "code", swift: "code", kt: "code",
  // assets
  png: "asset", jpg: "asset", jpeg: "asset", gif: "asset", svg: "asset",
  fbx: "asset", obj: "asset", gltf: "asset", glb: "asset", wav: "asset",
  mp3: "asset", ogg: "asset", prefab: "asset",
  // scenes
  unity: "scene", scene: "scene", tscn: "scene", blend: "scene",
  // shaders
  shader: "shader", hlsl: "shader", glsl: "shader", shadergraph: "shader",
  // config
  json: "config", yaml: "config", yml: "config", toml: "config",
  xml: "config", ini: "config", config: "config", env: "config",
  // docs
  md: "doc", mdx: "doc", txt: "doc", rst: "doc",
};

/** Classify a file by its extension. Pure and total; unknown → "other". */
export function inferFileType(path: string): WatchFileType {
  const base = path.split("/").pop() ?? path;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "other";
  const ext = base.slice(dot + 1).toLowerCase();
  return EXT_TYPE[ext] ?? "other";
}

/** A live event streamed from the /api/watch SSE endpoint. */
export interface LiveWatchEvent {
  path: string;
  kind: WatchKind;
}

/**
 * Map a changed file path to an Architecture system by name. A system matches
 * when every word of its name appears in the path (case-insensitive, in any
 * separator form: "Combat Core" matches src/combat/core, CombatCore.cs, or
 * combat-core/). Longest (most specific) name wins. Pure.
 */
export function matchSystemByPath<T extends { id: string; name: string }>(
  filePath: string,
  systems: readonly T[],
): T | null {
  const haystack = filePath.toLowerCase().replace(/[\\/_\-.]/g, " ");
  const compact = filePath.toLowerCase().replace(/[\\/_\-.\s]/g, "");
  let best: T | null = null;
  let bestLen = 0;
  for (const system of systems) {
    const words = system.name.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    const matches =
      words.every((w) => haystack.includes(w)) ||
      compact.includes(words.join(""));
    if (matches && system.name.length > bestLen) {
      best = system;
      bestLen = system.name.length;
    }
  }
  return best;
}
