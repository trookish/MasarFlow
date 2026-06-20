import { db } from "@/lib/db";
import { pluginStateSchema, type PluginState } from "@/lib/db/schema";
import { uuid, now } from "@/lib/utils/ids";
import type { PluginSettings } from "@/lib/plugins";

export const pluginsRepo = {
  async listByProject(projectId?: string | null): Promise<PluginState[]> {
    if (!projectId) return [];
    return db.plugins.where("projectId").equals(projectId).toArray();
  },

  async install(
    projectId: string,
    pluginId: string,
    settings: PluginSettings,
  ): Promise<PluginState> {
    const ts = now();
    const state = pluginStateSchema.parse({
      id: uuid(),
      projectId,
      pluginId,
      enabled: true,
      settings,
      installedAt: ts,
      updatedAt: ts,
    });
    await db.plugins.add(state);
    return state;
  },

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    await db.plugins.update(id, { enabled, updatedAt: now() });
  },

  async updateSettings(id: string, settings: PluginSettings): Promise<void> {
    await db.plugins.update(id, { settings, updatedAt: now() });
  },

  async uninstall(id: string): Promise<void> {
    await db.plugins.delete(id);
  },
};
