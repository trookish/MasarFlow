import type { MasarflowApi } from "@desktop-shared/api";

declare global {
  interface Window {
    masarflow?: MasarflowApi;
  }
}

/** The Electron preload API, or null when running in a plain browser / during SSR. */
export function getDesktop(): MasarflowApi | null {
  if (typeof window === "undefined") return null;
  return window.masarflow ?? null;
}
