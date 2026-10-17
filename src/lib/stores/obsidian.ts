import { create } from "zustand";
import { persist } from "zustand/middleware";
import { secretsAvailable } from "@/lib/secrets";

/**
 * Connection to the Obsidian "Local REST API" community plugin. The plugin
 * serves the vault over HTTPS on 127.0.0.1:27124 behind a bearer API key.
 * The key is kept in the OS keychain (desktop); in a plain browser (dev, no
 * secret store) it stays in localStorage as before.
 */
interface ObsidianState {
  baseUrl: string;
  apiKey: string;
  setBaseUrl: (v: string) => void;
  setApiKey: (v: string) => void;
}

export const useObsidianStore = create<ObsidianState>()(
  persist(
    (set) => ({
      baseUrl: "https://127.0.0.1:27124",
      apiKey: "",
      setBaseUrl: (baseUrl) => set({ baseUrl }),
      setApiKey: (apiKey) => set({ apiKey }),
    }),
    {
      name: "masarflow-obsidian",
      // Desktop: the API key lives in the OS keychain, never in localStorage.
      // Browser (dev): no secret store — persist it exactly as before.
      partialize: (s) =>
        secretsAvailable()
          ? { baseUrl: s.baseUrl }
          : { baseUrl: s.baseUrl, apiKey: s.apiKey },
    },
  ),
);
