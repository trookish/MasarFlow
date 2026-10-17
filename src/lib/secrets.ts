import { getDesktop } from "@/lib/desktop/bridge";

/**
 * Secret storage. In the desktop app values are encrypted by the OS keychain (via Electron
 * safeStorage) and never touch IndexedDB/localStorage. In a plain browser (dev only) there is
 * no secure store, so `secretsAvailable()` is false and callers keep their legacy storage.
 */
const fallback = new Map<string, string>();

export function _resetSecretsForTests(): void {
  fallback.clear();
}

/** True when an encrypted store backs get/set (desktop app). */
export function secretsAvailable(): boolean {
  return getDesktop()?.secrets !== undefined;
}

export async function getSecret(key: string): Promise<string> {
  const d = getDesktop();
  return d ? d.secrets.get(key) : (fallback.get(key) ?? "");
}

export async function setSecret(key: string, value: string): Promise<void> {
  const d = getDesktop();
  if (d) await d.secrets.set(key, value);
  else fallback.set(key, value);
}

export async function deleteSecret(key: string): Promise<void> {
  const d = getDesktop();
  if (d) await d.secrets.delete(key);
  else fallback.delete(key);
}
