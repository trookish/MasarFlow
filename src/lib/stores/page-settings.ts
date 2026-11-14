import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * In-memory fallback so the store also works during SSR / node tests (the
 * browser uses localStorage). Mirrors the dock store's approach.
 */
const fallbackStorage: Storage = (() => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
})();

export interface DashboardSettings {
  showMetrics: boolean;
  showActivity: boolean;
}

export interface BrainSettings {
  defaultView: "notes" | "canvas" | "templates";
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
  /** Backend new chat threads start on (a saved API connection or Ollama). */
  defaultBackend: "api" | "ollama";
  /**
   * Ordered fallback targets tried when the primary connection for a new
   * (API-backend) chat fails — copied into `thread.fallbacks` at creation.
   */
  fallbacks: { connectionId: string; modelId: string }[];
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

export interface InterfaceSettings {
  /** Row height for every list, table and toolbar in the app. */
  density: "comfortable" | "compact";
}

export interface AllPageSettings {
  interface: InterfaceSettings;
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
  interface: { density: "comfortable" },
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
    defaultBackend: "api",
    fallbacks: [],
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
    {
      name: "masarflow-page-settings",
      storage: createJSONStorage(() =>
        typeof localStorage === "undefined" ? fallbackStorage : localStorage,
      ),
      /**
       * Persisted states predate today's backend list: any stale or unknown
       * backend value normalizes to "api", and the chat defaults fill fields
       * old states never had (`fallbacks`).
       */
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AllPageSettings>;
        const chat: ChatSettings = {
          ...PAGE_SETTINGS_DEFAULTS.chat,
          ...(p.chat ?? {}),
        };
        if (chat.defaultBackend !== "api" && chat.defaultBackend !== "ollama") {
          chat.defaultBackend = "api";
        }
        return { ...current, ...p, chat };
      },
    },
  ),
);
