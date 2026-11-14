import { detectCapabilities } from "../capabilities";
import type { VaultBackend } from "./types";
import type { VaultBackendKind } from "../types";

export function selectBackendKind(): VaultBackendKind {
  if (typeof window === "undefined") return "legacy-fallback";
  const caps = detectCapabilities();
  if (caps.fsa) return "native-fsa";
  if (caps.opfs) return "opfs";
  return "legacy-fallback";
}

let cachedBackend: VaultBackend | null = null;
let cachedKind: VaultBackendKind | null = null;

export async function getBackend(): Promise<VaultBackend> {
  if (cachedBackend) return cachedBackend;
  const kind = selectBackendKind();
  const mod: { create: () => VaultBackend } = await import(`./${kindToModule(kind)}`);
  const b = mod.create();
  cachedBackend = b;
  cachedKind = kind;
  return b;
}

export function resetBackend() {
  cachedBackend = null;
  cachedKind = null;
}

export function getCachedKind(): VaultBackendKind | null {
  return cachedKind;
}

export async function warmBackendCache(kind: VaultBackendKind): Promise<VaultBackend> {
  if (cachedBackend && cachedKind === kind) return cachedBackend;
  const mod: { create: () => VaultBackend } = await import(`./${kindToModule(kind)}`);
  const b = mod.create();
  cachedBackend = b;
  cachedKind = kind;
  return b;
}

function kindToModule(k: VaultBackendKind): string {
  if (k === "native-fsa") return "native-fsa";
  if (k === "opfs") return "opfs";
  return "legacy-fallback";
}
