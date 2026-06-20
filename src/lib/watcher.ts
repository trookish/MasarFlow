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

/** A candidate change the simulated watcher can emit. */
export interface ChangeTemplate {
  path: string;
  systemHint: string | null;
}

/** Plausible project file changes, mapped to seeded system names where it fits. */
export const SIMULATED_CHANGES: ChangeTemplate[] = [
  { path: "src/input/InputSystem.cs", systemHint: "Input System" },
  { path: "src/combat/CombatCore.cs", systemHint: "Combat Core" },
  { path: "src/combat/DamageResolver.cs", systemHint: "Combat Core" },
  { path: "src/ai/EnemyBehaviour.cs", systemHint: "AI Subsystem" },
  { path: "src/ai/BossDirector.cs", systemHint: "Boss Director" },
  { path: "src/telemetry/Telemetry.cs", systemHint: "Telemetry" },
  { path: "config/balance.json", systemHint: "Combat Core" },
  { path: "assets/textures/hero_albedo.png", systemHint: null },
  { path: "assets/audio/sword_hit.wav", systemHint: null },
  { path: "scenes/Arena.scene", systemHint: null },
  { path: "shaders/Dissolve.shader", systemHint: null },
  { path: "docs/changelog.md", systemHint: null },
];

const KIND_WEIGHTS: WatchKind[] = [
  "modified", "modified", "modified", "created", "deleted",
];

export interface PickedChange {
  path: string;
  kind: WatchKind;
  fileType: WatchFileType;
  systemHint: string | null;
}

/**
 * Pick a simulated change. `rng` returns [0,1); injectable so the choice is
 * deterministic in tests.
 */
export function pickChange(rng: () => number = Math.random): PickedChange {
  const tpl = SIMULATED_CHANGES[Math.floor(rng() * SIMULATED_CHANGES.length)];
  const kind = KIND_WEIGHTS[Math.floor(rng() * KIND_WEIGHTS.length)];
  return {
    path: tpl.path,
    kind,
    fileType: inferFileType(tpl.path),
    systemHint: tpl.systemHint,
  };
}
