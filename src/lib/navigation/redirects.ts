import { SURFACES, ALIASES, locate, sectionUrl, SURFACE_ROUTES } from "./surfaces";

export interface LegacyRedirect {
  source: string;
  destination: string;
}

/**
 * Every v0.2 route and where it lives in the standard layout. Built from SURFACES, so a section
 * added there is redirected automatically. `/today` is both a legacy route and a surface, so it
 * has no entry. Applied client-side by the standard layout (the Studio layout still opens the
 * original pages in its panels, so a server redirect would break it).
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
];

const BY_SOURCE = new Map(LEGACY_REDIRECTS.map((r) => [r.source, r.destination]));

/**
 * Destination for a legacy URL, keeping its query (deep links like `/chat?thread=x` become
 * `/ask?view=chat&thread=x`). Null when the path is not a legacy route.
 */
export function resolveLegacyUrl(pathname: string, search = ""): string | null {
  const dest = BY_SOURCE.get(pathname.replace(/\/+$/, "") || "/");
  if (!dest) return null;
  const extra = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  extra.delete("view");
  const rest = extra.toString();
  if (!rest) return dest;
  return `${dest}${dest.includes("?") ? "&" : "?"}${rest}`;
}
