/**
 * Row density for every list, table and toolbar in the app.
 *
 * "Comfortable" is the default: 36 px rows with 16 px gutters. "Compact" drops to 28 px and
 * tighter gutters for people who work on small screens or keep a lot of rows on one page. The
 * values live here so a row's height is never a class that differs page to page; the CSS variable
 * `--row-h` is what rows actually consume (see globals.css `[data-density]`).
 */

export type Density = "comfortable" | "compact";

export const DENSITIES: readonly Density[] = ["comfortable", "compact"];

export const DENSITY_LABEL: Record<Density, string> = {
  comfortable: "Comfortable",
  compact: "Compact",
};

export const DENSITY_DESCRIPTION: Record<Density, string> = {
  comfortable: "36 px rows, room to read.",
  compact: "28 px rows, more on screen.",
};

export const ROW_HEIGHT: Record<Density, number> = {
  comfortable: 36,
  compact: 28,
};

/** Guards against a corrupt persisted value. */
export function normalizeDensity(value: unknown): Density {
  return value === "compact" ? "compact" : "comfortable";
}

/** Height in px a row renders at in this density. */
export function rowHeight(density: Density): number {
  return ROW_HEIGHT[normalizeDensity(density)];
}
