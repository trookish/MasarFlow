/**
 * Surface routes that were renamed. Kept dependency-free so the request proxy can import it.
 * Unlike a legacy page redirect, a rename keeps `?view=`: `/ask?view=agents` is `/ai?view=agents`.
 */
export const RENAMED_SURFACE_ROUTES: Readonly<Record<string, string>> = { "/ask": "/ai" };

/** The new URL for a renamed surface route, query preserved. Null when the path was not renamed. */
export function renamedSurfaceUrl(pathname: string, search = ""): string | null {
  const dest = RENAMED_SURFACE_ROUTES[pathname.replace(/\/+$/, "") || "/"];
  if (!dest) return null;
  const query = search.startsWith("?") ? search.slice(1) : search;
  return query ? `${dest}?${query}` : dest;
}
