import type { VaultBackendKind, VaultBackendCapabilities, VaultSession, VaultWriteResult } from "../types";
import type { VaultFileMeta } from "../types";

export interface VaultBackend {
  readonly kind: VaultBackendKind;
  readonly capabilities: VaultBackendCapabilities;
  rootName: string;
  pick(): Promise<VaultSession | null>;
  read(relativePath: string): Promise<string | null>;
  write(relativePath: string, body: string): Promise<VaultWriteResult>;
  walk(): Promise<VaultFileMeta[]>;
  reauthenticate?(): Promise<boolean>;
  close?(): Promise<void>;
}

export function getBackendCapabilities(kind: VaultBackendKind): VaultBackendCapabilities {
  if (kind === "native-fsa") {
    return { liveWatching: true, inPlaceWrites: true, multiSessionPersistence: true };
  }
  if (kind === "opfs") {
    return { liveWatching: false, inPlaceWrites: true, multiSessionPersistence: true };
  }
  if (kind === "legacy-fallback") {
    return { liveWatching: false, inPlaceWrites: false, multiSessionPersistence: false };
  }
  return { liveWatching: false, inPlaceWrites: false, multiSessionPersistence: false };
}
