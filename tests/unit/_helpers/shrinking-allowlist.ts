import { expect } from "vitest";

/**
 * Debt that may exist today but must never grow and must never go stale.
 * Fails on a NEW violation (not in `allowed`) and on a STALE entry
 * (listed in `allowed` but no longer a violation) so the list shrinks as
 * debt is paid. Remove entries from the caller's list; never add to it
 * without a written reason in the commit message.
 */
export function expectShrinkingAllowlist(actual: string[], allowed: string[]): void {
  const found = new Set(actual);
  const known = new Set(allowed);
  const fresh = [...found].filter((v) => !known.has(v)).sort();
  const stale = [...known].filter((v) => !found.has(v)).sort();
  expect({ fresh, stale }).toEqual({ fresh: [], stale: [] });
}
