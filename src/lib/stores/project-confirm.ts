import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ProjectConfirmState {
  /** Skip the confirmation dialog when deleting a project (toggled in Settings → Data). */
  skipProjectDeleteConfirm: boolean;
  setSkipProjectDeleteConfirm: (skip: boolean) => void;
}

export const useProjectConfirmStore = create<ProjectConfirmState>()(
  persist(
    (set) => ({
      skipProjectDeleteConfirm: false,
      setSkipProjectDeleteConfirm: (skipProjectDeleteConfirm) =>
        set({ skipProjectDeleteConfirm }),
    }),
    { name: "masarflow-project-confirm" },
  ),
);
