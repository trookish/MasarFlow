/** A configurable setting a plugin exposes. */
export interface PluginSettingField {
  key: string;
  label: string;
  type: "text" | "boolean" | "select";
  default: string | boolean;
  options?: string[];
  placeholder?: string;
}

export interface PluginDef {
  id: string;
  name: string;
  description: string;
  category: string;
  author: string;
  version: string;
  /** Lucide icon key, resolved to a component in the view. */
  icon: string;
  capabilities: string[];
  settings: PluginSettingField[];
}

export type PluginSettings = Record<string, string | boolean>;

/** Categories in display order. */
export const PLUGIN_CATEGORIES = [
  "Sync",
  "Editor",
  "Tasks",
  "Productivity",
  "Export",
] as const;

/**
 * The built-in plugin catalog. These are app-defined extensions; a project
 * installs them (persisted state lives in the `plugins` table).
 */
export const PLUGIN_CATALOG: PluginDef[] = [
  {
    id: "obsidian-sync",
    name: "Obsidian Sync",
    description:
      "Two-way sync between your workspace notes and an Obsidian vault on disk.",
    category: "Sync",
    author: "MasarFlow",
    version: "1.4.0",
    icon: "refresh",
    capabilities: ["Vault", "Two-way"],
    settings: [
      { key: "vaultPath", label: "Vault path", type: "text", default: "", placeholder: "~/Vaults/MyVault" },
      { key: "autoSync", label: "Auto-sync on change", type: "boolean", default: true },
    ],
  },
  {
    id: "github-commits",
    name: "GitHub Commits",
    description:
      "Pull commit history from a GitHub repository into the dev log and graph.",
    category: "Sync",
    author: "MasarFlow",
    version: "0.9.2",
    icon: "github",
    capabilities: ["Git", "Import"],
    settings: [
      { key: "repo", label: "Repository", type: "text", default: "", placeholder: "owner/name" },
      { key: "branch", label: "Branch", type: "text", default: "main" },
    ],
  },
  {
    id: "mermaid-diagrams",
    name: "Mermaid Diagrams",
    description: "Render Mermaid code blocks as diagrams in notes and docs.",
    category: "Editor",
    author: "Community",
    version: "2.1.0",
    icon: "network",
    capabilities: ["Rendering"],
    settings: [
      { key: "theme", label: "Diagram theme", type: "select", default: "default", options: ["default", "dark", "forest", "neutral"] },
    ],
  },
  {
    id: "spell-check",
    name: "Spell Check",
    description: "Inline spell-checking for the note and doc editors.",
    category: "Editor",
    author: "Community",
    version: "1.0.5",
    icon: "spellcheck",
    capabilities: ["Writing"],
    settings: [
      { key: "language", label: "Language", type: "select", default: "en", options: ["en", "fr", "de", "es"] },
    ],
  },
  {
    id: "word-count",
    name: "Word Count",
    description: "Show live word and character counts in the editor status bar.",
    category: "Editor",
    author: "MasarFlow",
    version: "1.2.0",
    icon: "hash",
    capabilities: ["Writing"],
    settings: [],
  },
  {
    id: "wip-limits",
    name: "Kanban WIP Limits",
    description: "Enforce work-in-progress limits per column on the task board.",
    category: "Tasks",
    author: "MasarFlow",
    version: "0.7.0",
    icon: "kanban",
    capabilities: ["Workflow"],
    settings: [
      { key: "limit", label: "Default column limit", type: "text", default: "5" },
    ],
  },
  {
    id: "daily-notes",
    name: "Daily Notes",
    description: "Create and open a dated daily note with one shortcut.",
    category: "Productivity",
    author: "Community",
    version: "3.0.1",
    icon: "calendar",
    capabilities: ["Notes"],
    settings: [
      { key: "template", label: "Template note", type: "text", default: "Daily" },
    ],
  },
  {
    id: "pomodoro",
    name: "Pomodoro Timer",
    description: "A focus timer with work/break intervals in the top bar.",
    category: "Productivity",
    author: "Community",
    version: "1.1.3",
    icon: "timer",
    capabilities: ["Focus"],
    settings: [
      { key: "minutes", label: "Focus minutes", type: "text", default: "25" },
    ],
  },
  {
    id: "export-pdf",
    name: "Export to PDF",
    description: "Export any note, doc, or spec to a styled PDF document.",
    category: "Export",
    author: "MasarFlow",
    version: "2.3.0",
    icon: "filedown",
    capabilities: ["Export"],
    settings: [],
  },
];

/** Build the default settings object for a plugin from its field defaults. */
export function defaultSettings(plugin: PluginDef): PluginSettings {
  const out: PluginSettings = {};
  for (const f of plugin.settings) out[f.key] = f.default;
  return out;
}

export interface PluginFilter {
  query?: string;
  category?: string | null;
  installedIds?: ReadonlySet<string>;
  installedOnly?: boolean;
}

/** Filter the catalog by search text, category, and install state. Pure. */
export function filterPlugins(
  catalog: PluginDef[],
  { query = "", category = null, installedIds, installedOnly = false }: PluginFilter,
): PluginDef[] {
  const q = query.trim().toLowerCase();
  return catalog.filter((p) => {
    if (category && p.category !== category) return false;
    if (installedOnly && !(installedIds?.has(p.id) ?? false)) return false;
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      p.capabilities.some((c) => c.toLowerCase().includes(q))
    );
  });
}
