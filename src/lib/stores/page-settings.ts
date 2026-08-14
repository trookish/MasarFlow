import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface DashboardSettings {
  showMetrics: boolean;
  showActivity: boolean;
}

export interface BrainSettings {
  defaultView: "notes" | "canvas" | "templates" | "graph";
  showWordCount: boolean;
  lineWrap: boolean;
}

export interface SpecsSettings {
  defaultSort: "updatedAt" | "title" | "status" | "progress";
  showCompleted: boolean;
}

export interface StandardsSettings {
  autoValidate: boolean;
  showLineNumbers: boolean;
}

export interface ArchitectureSettings {
  layout: "force" | "dagre";
  showNodeLabels: boolean;
  showEdgeLabels: boolean;
}

export interface KnowledgeSettings {
  layout: "force" | "radial";
  showOrphans: boolean;
  showEdgeLabels: boolean;
}

export interface TasksSettings {
  showCompleted: boolean;
  defaultGroup: "status" | "priority" | "assignee";
}

export interface SprintsSettings {
  showCompleted: boolean;
  velocityDisplay: "tasks" | "points" | "both";
}

export interface ChatSettings {
  showTimestamps: boolean;
  codeHighlighting: boolean;
  density: "compact" | "comfortable";
  /** Backend new chat threads start on (OpenCode / API / Ollama). */
  defaultBackend: "opencode" | "api" | "ollama";
}

export interface AgentsSettings {
  showDisabled: boolean;
}

export interface WorkflowSettings {
  autoAdvance: boolean;
}

export interface DocsSettings {
  defaultMode: "preview" | "edit";
  showLineNumbers: boolean;
}

export interface DevlogsSettings {
  showTime: boolean;
  groupBy: "day" | "week" | "month";
}

export interface SyncSettings {
  mode: "local" | "obsidian";
  autoSyncInterval: "off" | "15m" | "1h" | "6h";
  conflictResolution: "ask" | "prefer-local" | "prefer-remote";
  /** Vault folder whose files import as MasarFlow note templates ("" = none). */
  templatesFolder: string;
}

export interface WatcherSettings {
  showHiddenFiles: boolean;
  watchDepth: "1" | "3" | "unlimited";
  /** Absolute path of the local directory to watch ("" = not configured). */
  watchDir: string;
}

export interface SearchSettings {
  defaultMode: "semantic" | "keyword" | "hybrid";
  resultsPerPage: "10" | "20" | "50";
}

export interface PluginsPageSettings {
  showDisabled: boolean;
}

export interface CanvasSettings {
  showGrid: boolean;
  gridSize: number;
  snapToGrid: boolean;
  snapToObjects: boolean;
  zoomSpeed: number;
  cardShadows: boolean;
  /** Below this zoom level (0–1), nodes render simplified previews (LOD). */
  lodThreshold: number;
}

export interface AllPageSettings {
  dashboard: DashboardSettings;
  brain: BrainSettings;
  specs: SpecsSettings;
  standards: StandardsSettings;
  architecture: ArchitectureSettings;
  knowledge: KnowledgeSettings;
  tasks: TasksSettings;
  sprints: SprintsSettings;
  chat: ChatSettings;
  agents: AgentsSettings;
  workflow: WorkflowSettings;
  docs: DocsSettings;
  devlogs: DevlogsSettings;
  sync: SyncSettings;
  watcher: WatcherSettings;
  search: SearchSettings;
  plugins: PluginsPageSettings;
  canvas: CanvasSettings;
}

export type PageKey = keyof AllPageSettings;

export const PAGE_SETTINGS_DEFAULTS: AllPageSettings = {
  dashboard: { showMetrics: true, showActivity: true },
  brain: { defaultView: "notes", showWordCount: false, lineWrap: true },
  specs: { defaultSort: "updatedAt", showCompleted: true },
  standards: { autoValidate: true, showLineNumbers: true },
  architecture: {
    layout: "force",
    showNodeLabels: true,
    showEdgeLabels: false,
  },
  knowledge: { layout: "force", showOrphans: true, showEdgeLabels: true },
  tasks: { showCompleted: false, defaultGroup: "status" },
  sprints: { showCompleted: false, velocityDisplay: "tasks" },
  chat: {
    showTimestamps: false,
    codeHighlighting: true,
    density: "comfortable",
    defaultBackend: "opencode",
  },
  agents: { showDisabled: false },
  workflow: { autoAdvance: false },
  docs: { defaultMode: "preview", showLineNumbers: true },
  devlogs: { showTime: true, groupBy: "day" },
  sync: {
    mode: "obsidian",
    autoSyncInterval: "off",
    conflictResolution: "ask",
    templatesFolder: "",
  },
  watcher: { showHiddenFiles: false, watchDepth: "3", watchDir: "" },
  search: { defaultMode: "semantic", resultsPerPage: "20" },
  plugins: { showDisabled: true },
  canvas: {
    showGrid: true,
    gridSize: 20,
    snapToGrid: false,
    snapToObjects: true,
    zoomSpeed: 1,
    cardShadows: true,
    lodThreshold: 0.5,
  },
};

interface PageSettingsStore extends AllPageSettings {
  update: <K extends PageKey>(
    page: K,
    patch: Partial<AllPageSettings[K]>,
  ) => void;
  reset: (page: PageKey) => void;
}

export const usePageSettings = create<PageSettingsStore>()(
  persist(
    (set) => ({
      ...PAGE_SETTINGS_DEFAULTS,
      update: (page, patch) =>
        set((s) => ({
          [page]: { ...(s[page as PageKey] as object), ...patch },
        })),
      reset: (page) => set({ [page]: PAGE_SETTINGS_DEFAULTS[page] }),
    }),
    { name: "masarflow-page-settings" },
  ),
);
