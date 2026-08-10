"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_AGENT_CONFIG } from "@/lib/ai/agent";

/**
 * Agent safety limits, persisted locally (Settings → AI agent). These bound
 * every agent run: iteration count, wall-clock runtime, per-tool time, shell
 * commands, and file modifications. When a limit trips, the agent stops
 * safely and explains what happened.
 */

export interface AgentSettingsState {
  maxIterations: number;
  maxRunMs: number;
  maxToolMs: number;
  maxShellCommands: number;
  maxFileModifications: number;
  set: (patch: Partial<Omit<AgentSettingsState, "set">>) => void;
}

function clamped(
  v: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : fallback;
}

export const useAgentSettings = create<AgentSettingsState>()(
  persist(
    (set) => ({
      maxIterations: DEFAULT_AGENT_CONFIG.maxIterations,
      maxRunMs: DEFAULT_AGENT_CONFIG.maxRunMs,
      maxToolMs: DEFAULT_AGENT_CONFIG.maxToolMs,
      maxShellCommands: DEFAULT_AGENT_CONFIG.maxShellCommands,
      maxFileModifications: DEFAULT_AGENT_CONFIG.maxFileModifications,
      set: (patch) =>
        set((s) => ({
          ...s,
          ...(patch.maxIterations !== undefined
            ? {
                maxIterations: clamped(
                  patch.maxIterations,
                  s.maxIterations,
                  1,
                  100,
                ),
              }
            : {}),
          ...(patch.maxRunMs !== undefined
            ? {
                maxRunMs: clamped(
                  patch.maxRunMs,
                  s.maxRunMs,
                  10_000,
                  3_600_000,
                ),
              }
            : {}),
          ...(patch.maxToolMs !== undefined
            ? {
                maxToolMs: clamped(
                  patch.maxToolMs,
                  s.maxToolMs,
                  1_000,
                  300_000,
                ),
              }
            : {}),
          ...(patch.maxShellCommands !== undefined
            ? {
                maxShellCommands: clamped(
                  patch.maxShellCommands,
                  s.maxShellCommands,
                  0,
                  200,
                ),
              }
            : {}),
          ...(patch.maxFileModifications !== undefined
            ? {
                maxFileModifications: clamped(
                  patch.maxFileModifications,
                  s.maxFileModifications,
                  0,
                  200,
                ),
              }
            : {}),
        })),
    }),
    { name: "masarflow-agent-settings" },
  ),
);

/** The persisted limits as an AgentConfig for the AgentController. */
export function agentConfigFromSettings(
  s: AgentSettingsState,
): import("@/lib/ai/agent").AgentConfig {
  return {
    maxIterations: s.maxIterations,
    maxRunMs: s.maxRunMs,
    maxToolMs: s.maxToolMs,
    maxShellCommands: s.maxShellCommands,
    maxFileModifications: s.maxFileModifications,
  };
}
