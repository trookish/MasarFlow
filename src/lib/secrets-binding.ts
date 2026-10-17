import type { StoreApi } from "zustand";
import { deleteSecret, getSecret, secretsAvailable, setSecret } from "@/lib/secrets";

/**
 * Keep one string field of a zustand store in the encrypted secret store.
 * - a legacy plaintext value found in the store is moved to the vault;
 * - an empty store is hydrated from the vault;
 * - later changes are mirrored (empty → delete).
 * Pair with `partialize` on the store's `persist` config so the field never reaches localStorage.
 * Returns an unsubscribe function.
 */
export async function bindSecretField<S extends object>(
  store: StoreApi<S>,
  field: keyof S & string,
  secretKey: string,
): Promise<() => void> {
  if (!secretsAvailable()) return () => {};
  const current = String(store.getState()[field] ?? "");
  if (current) {
    await setSecret(secretKey, current);
    // Force a persist write so the plaintext is dropped from localStorage (partialize excludes it).
    store.setState({} as Partial<S>);
  } else {
    const stored = await getSecret(secretKey);
    if (stored) store.setState({ [field]: stored } as unknown as Partial<S>);
  }
  let last = String(store.getState()[field] ?? "");
  return store.subscribe((s) => {
    const v = String(s[field] ?? "");
    if (v === last) return;
    last = v;
    void (v ? setSecret(secretKey, v) : deleteSecret(secretKey));
  });
}
