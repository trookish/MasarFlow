import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * GitHub connection settings. The PAT is stored in localStorage on the user's
 * machine only and is sent exclusively to the local /api/github proxy, which
 * talks to GitHub via Octokit.
 */
export interface GithubSettings {
  pat: string;
  owner: string;
  repo: string;
  branch: string;
  lastSyncedAt: number | null;
}

interface GithubStore extends GithubSettings {
  update: (patch: Partial<GithubSettings>) => void;
}

export const useGithub = create<GithubStore>()(
  persist(
    (set) => ({
      pat: "",
      owner: "",
      repo: "",
      branch: "",
      lastSyncedAt: null,
      update: (patch) => set(patch),
    }),
    { name: "masarflow-github" },
  ),
);

/** Whether enough settings exist to attempt a sync. */
export function isGithubConfigured(s: GithubSettings): boolean {
  return Boolean(s.pat.trim() && s.owner.trim() && s.repo.trim());
}
