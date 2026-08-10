/**
 * Module-level cache for the provider/model catalog, kept out of the route
 * file so Next.js's route typing stays clean (route files may only export
 * HTTP methods/config). Test hook included for hermetic tests.
 */

import type { OpenCodeModelsResponse } from "./types";

let cache: { at: number; payload: OpenCodeModelsResponse } | null = null;

export function getCachedModels(): {
  at: number;
  payload: OpenCodeModelsResponse;
} | null {
  return cache;
}

export function setCachedModels(payload: OpenCodeModelsResponse): void {
  cache = { at: Date.now(), payload };
}

export function resetModelsCacheForTests(): void {
  cache = null;
}
