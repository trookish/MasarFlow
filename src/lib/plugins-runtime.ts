"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { pluginsRepo } from "@/lib/db/repos";
import { useActiveProjectId } from "@/lib/hooks/use-project";
import {
  PLUGIN_CATALOG,
  defaultSettings,
  type PluginSettings,
} from "@/lib/plugins";

/**
 * The plugin runtime: feature modules ask it whether a plugin is active for
 * the current project and what its settings are, and change their behavior
 * accordingly. This is what makes an installed plugin real rather than a row
 * in a table.
 */

export interface ActivePlugin {
  /** Installed AND enabled for the active project. */
  active: boolean;
  installed: boolean;
  /** Effective settings: stored values over the catalog defaults. */
  settings: PluginSettings;
}

const NOT_INSTALLED: ActivePlugin = {
  active: false,
  installed: false,
  settings: {},
};

/** Live plugin state for the active project. */
export function usePlugin(pluginId: string): ActivePlugin {
  const projectId = useActiveProjectId();
  const states = useLiveQuery(
    () => pluginsRepo.listByProject(projectId),
    [projectId],
  );
  const state = states?.find((s) => s.pluginId === pluginId);
  if (!state) return NOT_INSTALLED;
  const def = PLUGIN_CATALOG.find((p) => p.id === pluginId);
  return {
    active: state.enabled,
    installed: true,
    settings: { ...(def ? defaultSettings(def) : {}), ...state.settings },
  };
}

/** A plugin setting as a string (with fallback). */
export function settingStr(
  settings: PluginSettings,
  key: string,
  fallback = "",
): string {
  const v = settings[key];
  return typeof v === "string" && v.trim() ? v : fallback;
}

/** A plugin setting as a positive integer (with fallback). */
export function settingInt(
  settings: PluginSettings,
  key: string,
  fallback: number,
): number {
  const v = settings[key];
  const n = typeof v === "string" ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
