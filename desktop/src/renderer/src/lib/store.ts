import { create } from "zustand";
import type {
  AppSettings,
  EnvField,
  ServerStatus,
  SessionInfo,
  SetupState,
  TestRunResult,
  UpdateInfo,
} from "@shared/types";

export type Page = "run" | "setup" | "config" | "testing";

export const DEFAULT_SERVER: ServerStatus = { app: false, python: false, appPort: 3000, pythonPort: 8000 };

interface AppStore {
  page: Page;
  setPage: (p: Page) => void;

  sessions: SessionInfo[];
  setSessions: (s: SessionInfo[]) => void;
  upsertSession: (s: SessionInfo) => void;
  removeSession: (id: string) => void;
  activeSessionId: string | null;
  activateSession: (id: string | null) => void;

  terminalOpen: boolean;
  setTerminalOpen: (open: boolean) => void;

  settings: AppSettings | null;
  setSettings: (s: AppSettings) => void;
  patchSettings: (p: Partial<AppSettings>) => Promise<AppSettings>;

  banner: string | null;
  setBanner: (b: string | null) => void;

  setup: SetupState | null;
  setSetup: (s: SetupState) => void;

  server: ServerStatus;
  setServer: (s: ServerStatus) => void;

  env: EnvField[] | null;
  setEnv: (f: EnvField[]) => void;

  testResults: Record<string, TestRunResult>;
  setTestResult: (r: TestRunResult) => void;

  updateInfo: UpdateInfo | null;
  setUpdateInfo: (i: UpdateInfo | null) => void;

  maximized: boolean;
  setMaximized: (m: boolean) => void;
}

export const useApp = create<AppStore>()((set) => ({
  page: "run",
  setPage: (p) => set({ page: p }),

  sessions: [],
  setSessions: (sessions) => set({ sessions }),
  upsertSession: (info) =>
    set((s) => {
      const existing = s.sessions.some((x) => x.id === info.id);
      return {
        sessions: existing
          ? s.sessions.map((x) => (x.id === info.id ? info : x))
          : [...s.sessions, info],
      };
    }),
  removeSession: (id) =>
    set((s) => ({
      sessions: s.sessions.filter((x) => x.id !== id),
      activeSessionId: s.activeSessionId === id ? null : s.activeSessionId,
    })),
  activeSessionId: null,
  activateSession: (id) => set({ activeSessionId: id }),

  terminalOpen: false,
  setTerminalOpen: (open) => set({ terminalOpen: open }),

  settings: null,
  setSettings: (settings) => set({ settings }),
  patchSettings: async (patch) => {
    const next = await window.masarFlow.settings.set(patch);
    set({ settings: next });
    return next;
  },

  banner: null,
  setBanner: (banner) => set({ banner }),

  setup: null,
  setSetup: (setup) => set({ setup }),

  server: DEFAULT_SERVER,
  setServer: (server) => set({ server }),

  env: null,
  setEnv: (env) => set({ env }),

  testResults: {},
  setTestResult: (r) => set((s) => ({ testResults: { ...s.testResults, [r.key]: r } })),

  maximized: false,
  setMaximized: (maximized) => set({ maximized }),

  updateInfo: null,
  setUpdateInfo: (updateInfo) => set({ updateInfo }),
}));

/** Open the terminal and focus a session (creating a shell tab when needed). */
export async function openTerminalWithSession(id: string): Promise<void> {
  const s = useApp.getState();
  s.setTerminalOpen(true);
  s.activateSession(id);
}
