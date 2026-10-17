import { create } from "zustand";
import { persist } from "zustand/middleware";
import { fetchUpdateInfo, type UpdateInfo } from "@/lib/updates";
import { getDesktop } from "@/lib/desktop/bridge";
import type { UpdaterStatus } from "@desktop-shared/updater-status";

export type UpdateCheckState = "idle" | "checking" | "checked";

interface UpdatesState {
  state: UpdateCheckState;
  info: UpdateInfo | null;
  lastCheckedAt: number | null;
  /** Check GitHub automatically when the app starts (persisted). */
  autoCheck: boolean;
  /** P10.T9: live electron-updater status in the desktop app (null in a browser). */
  updaterStatus: UpdaterStatus | null;
  setAutoCheck: (on: boolean) => void;
  /** Run an update check: electron-updater in the desktop app, GitHub in a browser. */
  check: () => Promise<UpdateInfo>;
  /** Subscribe to main-process updater events; returns the unsubscribe function. */
  bindUpdater: () => () => void;
}

export const useUpdatesStore = create<UpdatesState>()(
  persist(
    (set, get) => ({
      state: "idle",
      info: null,
      lastCheckedAt: null,
      autoCheck: true,
      updaterStatus: null,
      setAutoCheck: (autoCheck) => set({ autoCheck }),
      check: async () => {
        if (get().state === "checking")
          return get().info ?? (await fetchUpdateInfo());
        const d = getDesktop();
        if (d) {
          // Desktop: the real updater owns the answer; the GitHub check stays
          // as the browser/dev path only.
          set({ state: "checking" });
          const status = await d.updater.check();
          set({ state: "checked", updaterStatus: status, lastCheckedAt: Date.now() });
          return get().info ?? (await fetchUpdateInfo());
        }
        set({ state: "checking" });
        const info = await fetchUpdateInfo();
        set({ state: "checked", info, lastCheckedAt: Date.now() });
        return info;
      },
      bindUpdater: () => {
        const d = getDesktop();
        if (!d) return () => {};
        void d.updater.get().then((s) => set({ updaterStatus: s }));
        return d.updater.onStatus((s) => set({ updaterStatus: s }));
      },
    }),
    {
      name: "masarflow-updates",
      // Only the preference persists; check results are per-session.
      partialize: (s) => ({ autoCheck: s.autoCheck }),
    },
  ),
);
