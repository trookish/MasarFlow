import { z } from "zod";

const PluginManifestSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9_-]+$/, "lowercase letters, digits, hyphen, underscore only"),
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "semver required"),
  description: z.string().default(""),
  author: z.string().default("Anonymous"),
  homepage: z.string().url().optional(),
  contributes: z.object({
    agents: z.array(z.object({
      id: z.string(),
      name: z.string(),
      role: z.string(),
      persona: z.string(),
      description: z.string().default(""),
      capabilities: z.array(z.string()).default([]),
    })).default([]),
    commands: z.array(z.object({
      id: z.string(),
      label: z.string(),
      description: z.string().default(""),
      keywords: z.array(z.string()).default([]),
    })).default([]),
    panels: z.array(z.object({
      id: z.string(),
      title: z.string(),
      icon: z.string().default("puzzle"),
    })).default([]),
    graphNodeKinds: z.array(z.object({
      id: z.string(),
      label: z.string(),
      color: z.string().default("var(--primary)"),
    })).default([]),
    themes: z.array(z.object({
      id: z.string(),
      name: z.string(),
      accent: z.string().optional(),
    })).default([]),
  }).default({}),
  permissions: z.array(z.enum(["read-data", "write-data", "execute-ai", "register-ui"])).default([]),
  enabled: z.boolean().default(true),
});

export type PluginManifest = z.infer<typeof PluginManifestSchema>;

export interface LoadedPlugin {
  manifest: PluginManifest;
  enabled: boolean;
  installedAt: number;
  source: "builtin" | "localStorage" | "user";
  error?: string;
}

const STORAGE_KEY = "masarflow.plugins.v1";
const ENABLED_OVERRIDES_KEY = "masarflow.plugins.enabled.v1";

const BUILTIN_BUILDER: Array<Record<string, unknown>> = [
  {
    id: "masarflow-core-agents",
    name: "Core Agents",
    version: "1.0.0",
    description: "The eight built-in specialized agents (Architect, Planner, Programmer, Reviewer, Optimizer, Tester, Documenter, Designer).",
    author: "MasarFlow",
    contributes: {
      agents: [
        { id: "ag_arch", name: "Architect", role: "architect", persona: "Thinks in modules, dependencies, and lifetimes.", description: "Analyzes system design and proposes structures.", capabilities: ["system-design", "adr", "dependency-analysis"] },
        { id: "ag_plan", name: "Planner", role: "planner", persona: "Decomposes features into sequenced, testable steps.", description: "Generates implementation plans from specs.", capabilities: ["roadmap", "estimation", "risk-analysis"] },
      ],
    },
    permissions: ["read-data", "register-ui"],
    enabled: true,
  },
  {
    id: "masarflow-command-palette",
    name: "Command Palette Extensions",
    version: "1.0.0",
    description: "Adds a curated set of command palette actions (Create Spec, Run Workflow, Reset Seed).",
    author: "MasarFlow",
    contributes: {
      commands: [
        { id: "new-spec", label: "New specification", description: "Create a new RFC-style specification.", keywords: ["rfc", "spec", "create"] },
        { id: "run-workflow", label: "Run AI workflow simulation", description: "Walk the 16-step pipeline.", keywords: ["ai", "workflow", "plan"] },
      ],
    },
    permissions: ["read-data", "register-ui"],
    enabled: true,
  },
  {
    id: "masarflow-graph-kinds",
    name: "Custom Graph Node Kinds",
    version: "1.0.0",
    description: "Adds Experiment and ADR node kinds to the Knowledge Graph, with distinct colors.",
    author: "MasarFlow",
    contributes: {
      graphNodeKinds: [
        { id: "experiment", label: "Experiment", color: "var(--graph-arch)" },
        { id: "adr", label: "ADR (Architecture Decision)", color: "var(--graph-spec)" },
      ],
    },
    permissions: ["read-data", "register-ui"],
    enabled: true,
  },
  {
    id: "masarflow-extra-theme",
    name: "Sunset Theme",
    version: "1.0.0",
    description: "Adds a sunset accent color (orange-amber) for users who prefer warmer palettes.",
    author: "MasarFlow",
    contributes: {
      themes: [{ id: "sunset", name: "Sunset", accent: "amber" }],
    },
    permissions: ["register-ui"],
    enabled: false,
  },
];
const BUILTIN: PluginManifest[] = BUILTIN_BUILDER.map((r) => PluginManifestSchema.parse(r));

let userPlugins: LoadedPlugin[] = [];
let enabledOverrides: Record<string, boolean> = {};
const listeners = new Set<() => void>();

function emit() { for (const cb of listeners) try { cb(); } catch (e) { console.warn(e); } }

export function onPluginsChanged(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch { return fallback; }
}

function writeStorage(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { console.warn(e); }
}

export function loadFromStorage() {
  userPlugins = readStorage<LoadedPlugin[]>(STORAGE_KEY, []);
  enabledOverrides = readStorage<Record<string, boolean>>(ENABLED_OVERRIDES_KEY, {});
  emit();
}

export function listPlugins(): LoadedPlugin[] {
  const builtin: LoadedPlugin[] = BUILTIN.map((m) => ({
    manifest: m,
    enabled: enabledOverrides[m.id] ?? m.enabled,
    installedAt: 0,
    source: "builtin",
  }));
  return [...builtin, ...userPlugins];
}

export function getPlugin(id: string): LoadedPlugin | undefined {
  return listPlugins().find((p) => p.manifest.id === id);
}

export function getEnabledPlugins(): LoadedPlugin[] {
  return listPlugins().filter((p) => p.enabled);
}

export function setEnabled(id: string, enabled: boolean) {
  enabledOverrides[id] = enabled;
  writeStorage(ENABLED_OVERRIDES_KEY, enabledOverrides);
  emit();
}

export function uninstallPlugin(id: string) {
  userPlugins = userPlugins.filter((p) => p.manifest.id !== id);
  delete enabledOverrides[id];
  writeStorage(STORAGE_KEY, userPlugins);
  writeStorage(ENABLED_OVERRIDES_KEY, enabledOverrides);
  emit();
}

export function installFromJson(json: string, source: "user" | "localStorage" = "user"): { ok: boolean; plugin?: LoadedPlugin; error?: string } {
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch (e) { return { ok: false, error: "Invalid JSON: " + (e as Error).message }; }
  const r = PluginManifestSchema.safeParse(parsed);
  if (!r.success) {
    return { ok: false, error: "Manifest validation failed: " + r.error.issues.map((i) => i.path.join(".") + ": " + i.message).join("; ") };
  }
  const existing = getPlugin(r.data.id);
  if (existing) {
    return { ok: false, error: "Plugin with id " + r.data.id + " is already installed." };
  }
  const plugin: LoadedPlugin = {
    manifest: r.data,
    enabled: r.data.enabled,
    installedAt: Date.now(),
    source,
  };
  userPlugins = [...userPlugins, plugin];
  writeStorage(STORAGE_KEY, userPlugins);
  emit();
  return { ok: true, plugin };
}

export function buildSamplePluginJson(id: string): string {
  return JSON.stringify({
    id,
    name: "My Plugin " + id,
    version: "0.1.0",
    description: "A custom plugin that adds a new agent kind.",
    author: "You",
    contributes: {
      agents: [
        { id: "ag_" + id, name: "Custom Agent", role: id, persona: "Does " + id + " things.", description: "Custom agent installed via plugin.", capabilities: ["custom"] },
      ],
      commands: [
        { id: "hello", label: "Say hello", description: "A sample command.", keywords: ["hello"] },
      ],
      graphNodeKinds: [
        { id: id + "-kind", label: "Custom Node", color: "var(--primary)" },
      ],
    },
    permissions: ["read-data", "register-ui"],
  }, null, 2);
}

export function getSamplePluginIds(): string[] {
  return ["lighthouse", "specbook", "echodiary"];
}
