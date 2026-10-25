"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createVaultIO, type VaultIO } from "@/lib/vault/io";
import { resolveVaultConflict, runVaultSync, type VaultDeps, type VaultRunSummary } from "@/lib/vault/engine";
import { DEFAULT_BINDING, useVaultStore, vaultBindingFor, type VaultBinding } from "@/lib/stores/vault";
import { vaultSummaryLine } from "@/lib/vault/view";
import { getDesktop } from "@/lib/desktop/bridge"; // P1 (src/lib/desktop/bridge.ts)
import { runExclusive } from "@/lib/vault/runner";

const AUTO_SYNC_MS = 60_000;
const FOCUS_STALE_MS = 30_000;

export interface VaultSyncApi {
  binding: VaultBinding;
  running: boolean;
  summary: VaultRunSummary | null;
  message: string;
  /** `adoptUntracked` imports files the index has never seen (only on an explicit user action). */
  run: (opts?: { autoImport?: boolean; adoptUntracked?: boolean }) => Promise<VaultRunSummary | null>;
  resolve: (entityId: string, choice: "app" | "file" | "recreate") => Promise<void>;
  pickFolder: () => Promise<string | null>;
  setBinding: (root: string) => void;
  setFlags: (patch: Partial<Pick<VaultBinding, "enabled" | "autoImport">>) => void;
  unbind: () => void;
}

/** Bind a folder, run the mirror, answer conflicts. One place, one busy flag. */
export function useVaultSync(projectId: string | null, projectSlug: string): VaultSyncApi {
  const ioRef = useRef<VaultIO>(createVaultIO());
  const binding = useVaultStore((s) => (projectId ? s.byProject[projectId] ?? DEFAULT_BINDING : DEFAULT_BINDING));
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<VaultRunSummary | null>(null);
  const [message, setMessage] = useState("");

  const depsFor = useCallback(
    (over?: Partial<VaultDeps>): VaultDeps | null => {
      const b = vaultBindingFor(projectId);
      if (!projectId || !b.root || !b.folder) return null;
      return {
        io: ioRef.current,
        root: b.root,
        folder: b.folder,
        projectId,
        projectSlug,
        autoImport: b.autoImport,
        now: () => Date.now(),
        ...over,
      };
    },
    [projectId, projectSlug],
  );

  const run = useCallback<VaultSyncApi["run"]>(
    async (opts) => {
      const deps = depsFor({
        ...(opts?.autoImport === undefined ? {} : { autoImport: opts.autoImport }),
        ...(opts?.adoptUntracked ? { adoptUntracked: true } : {}),
      });
      if (!deps) {
        setMessage("Pick a folder for this project first.");
        return null;
      }
      setRunning(true);
      try {
        const result = await runExclusive(deps.projectId, () => runVaultSync(deps));
        setSummary(result);
        const line = vaultSummaryLine(result);
        // Surface the first warning verbatim: the P2 guard's 403 message (an
        // unlinked folder) must reach the user, not just be counted.
        setMessage(result.errors.length ? `${line} — ${result.errors[0]}` : line);
        useVaultStore.getState().patch(deps.projectId, { lastRunAt: Date.now(), lastSummary: line });
        return result;
      } catch (e) {
        setMessage(e instanceof Error ? e.message : String(e));
        return null;
      } finally {
        setRunning(false);
      }
    },
    [depsFor],
  );

  const resolve = useCallback<VaultSyncApi["resolve"]>(
    async (entityId, choice) => {
      const deps = depsFor();
      if (!deps) return;
      try {
        await runExclusive(deps.projectId, () => resolveVaultConflict(deps, entityId, choice));
        await run();
      } catch (e) {
        setMessage(e instanceof Error ? e.message : String(e));
      }
    },
    [depsFor, run],
  );

  const setBinding = useCallback(
    (root: string) => {
      if (!projectId) return;
      useVaultStore.getState().bind(projectId, root, projectSlug);
    },
    [projectId, projectSlug],
  );

  const pickFolder = useCallback(async () => {
    const api = getDesktop();
    const picked = (await api?.dialog?.chooseFolder?.()) ?? null;
    // Browser dev fallback: the user types a path and /api/fs validates it (P2).
    if (!picked) return null;
    setBinding(picked);
    return picked;
  }, [setBinding]);

  const setFlags = useCallback<VaultSyncApi["setFlags"]>(
    (patch) => {
      if (!projectId) return;
      useVaultStore.getState().patch(projectId, patch);
    },
    [projectId],
  );

  const unbind = useCallback(() => {
    if (projectId) useVaultStore.getState().unbind(projectId);
  }, [projectId]);

  useEffect(() => {
    if (!binding.enabled || !binding.root || !projectId) return;
    let cancelled = false;
    const tick = (): void => {
      if (!cancelled) void run();
    };
    tick();
    const id = window.setInterval(tick, AUTO_SYNC_MS);
    const onFocus = (): void => {
      if (Date.now() - (vaultBindingFor(projectId).lastRunAt ?? 0) > FOCUS_STALE_MS) tick();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [binding.enabled, binding.root, projectId, run]);

  return { binding, running, summary, message, run, resolve, pickFolder, setBinding, setFlags, unbind };
}
