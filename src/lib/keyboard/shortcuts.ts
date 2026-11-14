export type ShortcutScope = "global" | "go-to" | "action" | "create";

export interface ShortcutDef {
  id: string;
  scope: ShortcutScope;
  keys: string;
  label: string;
  group: string;
  description: string;
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? "Cmd" : "Ctrl";

export const SHORTCUTS: ShortcutDef[] = [
  {
    id: "palette",
    scope: "global",
    keys: mod + " K",
    label: "Command palette",
    group: "Global",
    description: "Open the command palette",
  },
  {
    id: "search",
    scope: "global",
    keys: mod + " /",
    label: "Global search",
    group: "Global",
    description: "Open the global search dialog",
  },
  {
    id: "project",
    scope: "global",
    keys: mod + " P",
    label: "Project switcher",
    group: "Global",
    description: "Switch between projects",
  },
  {
    id: "leftnav",
    scope: "global",
    keys: mod + " B",
    label: "Toggle left nav",
    group: "Global",
    description: "Show or hide the left sidebar",
  },
  {
    id: "rightrail",
    scope: "global",
    keys: mod + " .",
    label: "Toggle right rail",
    group: "Global",
    description: "Show or hide the right rail",
  },
  {
    id: "statusbar",
    scope: "global",
    keys: mod + " \\\\",
    label: "Toggle status bar",
    group: "Global",
    description: "Show or hide the bottom status bar",
  },
  {
    id: "cheatsheet",
    scope: "global",
    keys: "?",
    label: "Keyboard cheatsheet",
    group: "Global",
    description: "Open this cheatsheet",
  },
  {
    id: "go-dashboard",
    scope: "go-to",
    keys: "G D",
    label: "Go to Dashboard",
    group: "Go to",
    description: "Open the dashboard",
  },
  {
    id: "go-brain",
    scope: "go-to",
    keys: "G B",
    label: "Go to Brain",
    group: "Go to",
    description: "Open the Brain notes",
  },
  {
    id: "go-specs",
    scope: "go-to",
    keys: "G S",
    label: "Go to Specifications",
    group: "Go to",
    description: "Open the specifications list",
  },
  {
    id: "go-tasks",
    scope: "go-to",
    keys: "G T",
    label: "Go to Tasks",
    group: "Go to",
    description: "Open the tasks board",
  },
  {
    id: "go-architecture",
    scope: "go-to",
    keys: "G A",
    label: "Go to Architecture",
    group: "Go to",
    description: "Open the architecture graph",
  },
  {
    id: "go-graph",
    scope: "go-to",
    keys: "G K",
    label: "Go to Knowledge Graph",
    group: "Go to",
    description: "Open the knowledge graph",
  },
  {
    id: "go-logs",
    scope: "go-to",
    keys: "G L",
    label: "Go to Dev Logs",
    group: "Go to",
    description: "Open the dev logs timeline",
  },
  {
    id: "go-workflow",
    scope: "go-to",
    keys: "G W",
    label: "Go to AI Workflow",
    group: "Go to",
    description: "Open the AI workflow page",
  },
  {
    id: "new-note",
    scope: "create",
    keys: "N N",
    label: "New note",
    group: "Create",
    description: "Create a new note in Brain (opens /brain/new)",
  },
  {
    id: "new-spec",
    scope: "create",
    keys: "N S",
    label: "New spec",
    group: "Create",
    description: "Create a new specification",
  },
  {
    id: "new-task",
    scope: "create",
    keys: "N T",
    label: "New task",
    group: "Create",
    description: "Create a new task",
  },
  {
    id: "new-log",
    scope: "create",
    keys: "N L",
    label: "New dev log",
    group: "Create",
    description: "Create a new dev log",
  },
  {
    id: "new-doc",
    scope: "create",
    keys: "N D",
    label: "New doc",
    group: "Create",
    description: "Create a new doc",
  },
  {
    id: "new-standard",
    scope: "create",
    keys: "N X",
    label: "New standard",
    group: "Create",
    description: "Create a new standard",
  },
  {
    id: "save",
    scope: "action",
    keys: mod + " S",
    label: "Save",
    group: "Actions",
    description: "Save in the current editor",
  },
  {
    id: "review-plans",
    scope: "action",
    keys: "R P",
    label: "Review plans awaiting approval",
    group: "Actions",
    description: "Jump to the next plan awaiting approval",
  },
  {
    id: "run-workflow",
    scope: "action",
    keys: "R W",
    label: "Run AI workflow simulation",
    group: "Actions",
    description: "Trigger the 16-step pipeline",
  },
  {
    id: "cycle-ai",
    scope: "action",
    keys: "R A",
    label: "Cycle AI provider",
    group: "Actions",
    description: "Switch between simulated and real LLM providers",
  },
  {
    id: "reset-seed",
    scope: "action",
    keys: "R S",
    label: "Reset seed data",
    group: "Actions",
    description: "Wipe IndexedDB and re-seed",
  },
  {
    id: "sync-now",
    scope: "action",
    keys: "S S",
    label: "Sync vault now",
    group: "Actions",
    description: "Run vault pull+push immediately",
  },
  {
    id: "go-sync",
    scope: "go-to",
    keys: "G V",
    label: "Go to Sync",
    group: "Go to",
    description: "Open the vault sync manager",
  },
  {
    id: "go-plugins",
    scope: "go-to",
    keys: "G P",
    label: "Go to Plugins",
    group: "Go to",
    description: "Open the plugins manager",
  },
  {
    id: "go-settings",
    scope: "go-to",
    keys: "G ,",
    label: "Go to Settings",
    group: "Go to",
    description: "Open preferences",
  },
];

const OVERRIDES_KEY = "masarflow.shortcut.overrides.v1";

function readOverrides(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(OVERRIDES_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writeOverrides(o: Record<string, string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(OVERRIDES_KEY, JSON.stringify(o));
  } catch {}
}

export function getEffectiveShortcuts(): ShortcutDef[] {
  const o = readOverrides();
  return SHORTCUTS.map((s) => ({ ...s, keys: o[s.id] ?? s.keys }));
}

export function setShortcutOverride(id: string, keys: string) {
  const o = readOverrides();
  o[id] = keys;
  writeOverrides(o);
}

export function clearShortcutOverride(id: string) {
  const o = readOverrides();
  delete o[id];
  writeOverrides(o);
}

export function findConflicts(shortcuts: ShortcutDef[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const s of shortcuts) {
    const k = s.keys.toLowerCase().trim();
    if (!k) continue;
    const arr = map.get(k) ?? [];
    arr.push(s.id);
    map.set(k, arr);
  }
  const conflicts = new Map<string, string[]>();
  for (const [k, ids] of map) {
    if (ids.length > 1) conflicts.set(k, ids);
  }
  return conflicts;
}
