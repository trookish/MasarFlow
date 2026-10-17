"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { VAULT_SUBFOLDER } from "@/lib/vault/paths";

/**
 * Where each project is mirrored. The per-file truth lives in `syncFiles`;
 * this is only the user's choice, so losing it costs one folder pick.
 */

export interface VaultBinding {
  /** absolute folder the user picked (must be an allowed root — P2) */
  root: string;
  /** mirror subfolder inside it, e.g. `MasarFlow/my-project` */
  folder: string;
  enabled: boolean;
  autoImport: boolean;
  lastRunAt: number | null;
  lastSummary: string;
}

export const DEFAULT_BINDING: VaultBinding = {
  root: "",
  folder: "",
  enabled: false,
  autoImport: false,
  lastRunAt: null,
  lastSummary: "",
};

export function mirrorFolder(projectSlug: string): string {
  return `${VAULT_SUBFOLDER}/${projectSlug || "project"}`;
}

interface VaultStore {
  byProject: Record<string, VaultBinding>;
  bind: (projectId: string, root: string, projectSlug: string) => void;
  patch: (projectId: string, patch: Partial<VaultBinding>) => void;
  unbind: (projectId: string) => void;
}

export const useVaultStore = create<VaultStore>()(
  persist(
    (set) => ({
      byProject: {},
      bind: (projectId, root, projectSlug) =>
        set((s) => ({
          byProject: {
            ...s.byProject,
            [projectId]: { ...DEFAULT_BINDING, root, folder: mirrorFolder(projectSlug), enabled: true },
          },
        })),
      patch: (projectId, patch) =>
        set((s) => ({
          byProject: {
            ...s.byProject,
            [projectId]: { ...(s.byProject[projectId] ?? DEFAULT_BINDING), ...patch },
          },
        })),
      unbind: (projectId) =>
        set((s) => {
          const next = { ...s.byProject };
          delete next[projectId];
          return { byProject: next };
        }),
    }),
    { name: "masarflow-vault" },
  ),
);

/** The binding for a project, or the inert default. */
export function vaultBindingFor(projectId: string | null | undefined): VaultBinding {
  if (!projectId) return DEFAULT_BINDING;
  return useVaultStore.getState().byProject[projectId] ?? DEFAULT_BINDING;
}
