/** Pure helpers for URL-driven selection (?task=…, ?sprint=…). */

/** New search string selecting `id` for `param`. `null` writes an EXPLICIT empty value:
 * the dock keeps a per-panel snapshot and only an explicit value overrides it. */
export function withSelection(search: string, param: string, id: string | null): string {
  const next = new URLSearchParams(search);
  next.set(param, id ?? "");
  return next.toString();
}

export function readSelection(search: string, param: string): string | null {
  return new URLSearchParams(search).get(param) || null;
}

/**
 * The selection a (possibly hidden) page should show. `pathname` is the URL of the
 * FOCUSED panel; when it is not this page's `path`, keep `kept` (the last known value).
 */
export function selectionFor(
  pathname: string,
  path: string,
  search: string,
  param: string,
  kept: string | null,
): string | null {
  return pathname === path ? readSelection(search, param) : kept;
}
