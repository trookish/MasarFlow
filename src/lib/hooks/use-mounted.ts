"use client";

import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

/**
 * True after the component has mounted on the client, false during SSR and the
 * first client render. Uses `useSyncExternalStore` (no effect/setState) so it
 * is safe with strict hooks lint rules. Gate UI that depends on
 * persisted/browser-only state behind this to avoid hydration mismatches.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}
