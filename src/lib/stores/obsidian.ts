import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Connection to the Obsidian "Local REST API" community plugin. The plugin
 * serves the vault over HTTPS on 127.0.0.1:27124 behind a bearer API key.
 * Credentials live in localStorage (this is a local-only personal app, same as
 * the AI provider keys).
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
    { name: "masarflow-obsidian" },
  ),
);
