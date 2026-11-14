import { SURFACES, ALIASES, locate, sectionUrl, SURFACE_ROUTES } from "./surfaces";
import { RENAMED_SURFACE_ROUTES, renamedSurfaceUrl } from "./renamed-routes";

export interface LegacyRedirect {
  source: string;
  destination: string;
}

/**
 * Every legacy route and its canonical surface destination. Built from SURFACES so a new section is
 * redirected automatically. `/today` is already canonical and has no entry. Redirects run in the
 * shell so packaged deep links keep working without server-specific rewrite rules.
 */
export const LEGACY_REDIRECTS: LegacyRedirect[] = [
  ...SURFACES.flatMap((surface) =>
    surface.sections
      .filter((s) => !SURFACE_ROUTES.has(s.href))
      .map((s) => ({ source: s.href, destination: sectionUrl(surface, s.id) })),
  ),
  ...Object.keys(ALIASES).map((source) => {
    const hit = locate(source)!;
    return { source, destination: sectionUrl(hit.surface, hit.section.id) };
  }),
  ...Object.entries(RENAMED_SURFACE_ROUTES).map(([source, destination]) => ({ source, destination })),
];

const BY_SOURCE = new Map(LEGACY_REDIRECTS.map((r) => [r.source, r.destination]));

/**
 * Destination for a legacy URL, keeping its query (deep links like `/chat?thread=x` become
 * `/ai?thread=x`). A renamed surface keeps its `view` (`/ask?view=agents` becomes `/ai?view=agents`).
 * Null when the path is not a legacy route.
 */
export function resolveLegacyUrl(pathname: string, search = ""): string | null {
  const renamed = renamedSurfaceUrl(pathname, search);
  if (renamed) return renamed;
  const dest = BY_SOURCE.get(pathname.replace(/\/+$/, "") || "/");
  if (!dest) return null;
  const extra = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  extra.delete("view");
  const rest = extra.toString();
  if (!rest) return dest;
  return `${dest}${dest.includes("?") ? "&" : "?"}${rest}`;
}
