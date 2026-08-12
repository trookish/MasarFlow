import { create } from "zustand";
import { persist } from "zustand/middleware";
import { fetchUpdateInfo, type UpdateInfo } from "@/lib/updates";

export type UpdateCheckState = "idle" | "checking" | "checked";

interface UpdatesState {
  state: UpdateCheckState;
  info: UpdateInfo | null;
  lastCheckedAt: number | null;
  /** Check GitHub automatically when the app starts (persisted). */
  autoCheck: boolean;
  setAutoCheck: (on: boolean) => void;
  /** Run a GitHub update check (no-op while already checking). */
  check: () => Promise<UpdateInfo>;
}

export const useUpdatesStore = create<UpdatesState>()(
  persist(
    (set, get) => ({
      state: "idle",
      info: null,
      lastCheckedAt: null,
      autoCheck: true,
      setAutoCheck: (autoCheck) => set({ autoCheck }),
      check: async () => {
        if (get().state === "checking")
          return get().info ?? (await fetchUpdateInfo());
        set({ state: "checking" });
        const info = await fetchUpdateInfo();
        set({ state: "checked", info, lastCheckedAt: Date.now() });
        return info;
      },
    }),
    {
      name: "masarflow-updates",
      // Only the preference persists; check results are per-session.
      partialize: (s) => ({ autoCheck: s.autoCheck }),
    },
  ),
);
