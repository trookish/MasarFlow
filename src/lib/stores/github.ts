import { create } from "zustand";
import { persist } from "zustand/middleware";
import { secretsAvailable } from "@/lib/secrets";

/**
 * GitHub connection settings. The PAT is kept in the OS keychain (desktop) and
 * sent only to the local /api/github proxy, which talks to GitHub via Octokit.
 * In a plain browser (dev, no secret store) it stays in localStorage as before.
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
    {
      name: "masarflow-github",
      // Desktop: the PAT lives in the OS keychain, never in localStorage.
      // Browser (dev): no secret store — persist it exactly as before.
      partialize: (s) =>
        secretsAvailable()
          ? { owner: s.owner, repo: s.repo, branch: s.branch, lastSyncedAt: s.lastSyncedAt }
          : {
              pat: s.pat,
              owner: s.owner,
              repo: s.repo,
              branch: s.branch,
              lastSyncedAt: s.lastSyncedAt,
            },
    },
  ),
);

/** Whether enough settings exist to attempt a sync. */
export function isGithubConfigured(s: GithubSettings): boolean {
  return Boolean(s.pat.trim() && s.owner.trim() && s.repo.trim());
}
