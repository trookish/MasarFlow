/** A run of text, flagged whether it is part of a search match. */
export interface Segment {
  text: string;
  hit: boolean;
}

/**
 * Split `text` into alternating matched / unmatched segments from a set of
 * Fuse match ranges (inclusive `[start, end]` pairs). Pure and total: ranges
 * are clamped, sorted, and merged so overlaps or out-of-bounds indices never
 * produce broken output.
 */
export function highlightSegments(
  text: string,
  ranges: readonly (readonly [number, number])[],
): Segment[] {
  if (text.length === 0) return [];
  // Normalize: clamp to bounds, drop invalid, sort by start.
  const clean = ranges
    .map(([a, b]) => [Math.max(0, a), Math.min(text.length - 1, b)] as const)
    .filter(([a, b]) => b >= a)
    .sort((x, y) => x[0] - y[0]);

  if (clean.length === 0) return [{ text, hit: false }];

  // Merge overlapping / adjacent ranges.
  const merged: [number, number][] = [];
  for (const [a, b] of clean) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1] + 1) {
      last[1] = Math.max(last[1], b);
    } else {
      merged.push([a, b]);
    }
  }

  const segments: Segment[] = [];
  let cursor = 0;
  for (const [a, b] of merged) {
    if (a > cursor) segments.push({ text: text.slice(cursor, a), hit: false });
    segments.push({ text: text.slice(a, b + 1), hit: true });
    cursor = b + 1;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), hit: false });
  }
  return segments;
}

/**
 * A snippet of `text` centered on its first match, for showing body context in
 * results. Returns the windowed text plus match ranges rebased to the window.
 */
export function snippetAround(
  text: string,
  ranges: readonly (readonly [number, number])[],
  radius = 60,
): { text: string; ranges: [number, number][] } {
  if (ranges.length === 0) {
    return { text: text.slice(0, radius * 2), ranges: [] };
  }
  const first = [...ranges].sort((a, b) => a[0] - b[0])[0];
  const start = Math.max(0, first[0] - radius);
  const end = Math.min(text.length, first[1] + 1 + radius);
  const prefix = start > 0 ? "…" : "";
  const sliced = prefix + text.slice(start, end) + (end < text.length ? "…" : "");
  const shift = start - prefix.length;
  const rebased = ranges
    .map(([a, b]) => [a - shift, b - shift] as [number, number])
    .filter(([a, b]) => b >= 0 && a < sliced.length);
  return { text: sliced, ranges: rebased };
}
