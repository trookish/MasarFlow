"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AgentProvider = "simulated" | "openai" | "anthropic" | "google" | "openrouter";

interface AiState {
  provider: AgentProvider;
  showReasoning: boolean;
  streamingSpeed: "fast" | "normal" | "slow";
  setProvider: (p: AgentProvider) => void;
  setShowReasoning: (v: boolean) => void;
  setStreamingSpeed: (s: "fast" | "normal" | "slow") => void;
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
    }),
    { name: "masarflow.ai" },
  ),
);
