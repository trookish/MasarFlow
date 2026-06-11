"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AgentProvider = "simulated" | "openai" | "anthropic" | "google" | "openrouter";

interface AiState {
  provider: AgentProvider;
  showReasoning: boolean;
  streamingSpeed: "fast" | "normal" | "slow";
  apiKey: string;
  setProvider: (p: AgentProvider) => void;
  setApiKey: (k: string) => void;
  setShowReasoning: (v: boolean) => void;
  setStreamingSpeed: (s: "fast" | "normal" | "slow") => void;
  cycleProvider: () => void;
}

export const useAi = create<AiState>()(
  persist(
    (set) => ({
      provider: "simulated",
      showReasoning: true,
      streamingSpeed: "normal",
      setProvider: (provider) => set({ provider }),
      setShowReasoning: (showReasoning) => set({ showReasoning }),
      setStreamingSpeed: (streamingSpeed) => set({ streamingSpeed }),
      apiKey: "",
      setApiKey: (apiKey) => set({ apiKey }),
      cycleProvider: () => set((s) => {
        const order: AgentProvider[] = ["simulated", "openai", "anthropic", "google", "openrouter"];
        const i = order.indexOf(s.provider);
        return { provider: order[(i + 1) % order.length] };
      }),
    }),
    { name: "masarflow.ai" },
  ),
);
