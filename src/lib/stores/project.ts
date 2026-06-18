import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ProjectState {
  /** The project currently in focus across the workspace. */
  activeProjectId: string | null;
  setActiveProjectId: (id: string | null) => void;
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set) => ({
      activeProjectId: null,
      setActiveProjectId: (activeProjectId) => set({ activeProjectId }),
    }),
    { name: "masarflow-active-project" },
  ),
);
