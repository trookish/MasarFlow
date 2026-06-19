/**
 * Deterministic layered layout for the Architecture dependency diagram.
 *
 * Systems are placed in horizontal layers by their dependency *depth*: a system
 * with no (resolvable) dependencies sits at depth 0, and every dependent sits
 * one layer below the deepest thing it depends on. Within a layer, systems are
 * ordered alphabetically by name so the result is stable across renders.
 *
 * The function is pure and total — it never throws, tolerates dangling
 * dependency ids (ids not present in the input), and breaks dependency cycles
 * so a malformed graph still lays out instead of hanging.
 */

export interface LayoutSystem {
  id: string;
  name: string;
  dependencies: string[];
}

export interface XY {
  x: number;
  y: number;
}

/** Vertical distance between dependency layers. */
export const LAYER_HEIGHT = 150;
/** Horizontal distance between sibling systems in a layer. */
export const COLUMN_WIDTH = 240;

/**
 * Compute a position for every system. Returns a map keyed by system id.
 * Depth 0 (foundations — nothing they depend on) is at the top (y = 0).
 */
export function layoutSystems(systems: LayoutSystem[]): Record<string, XY> {
  const ids = new Set(systems.map((s) => s.id));
  const byId = new Map(systems.map((s) => [s.id, s]));

  const depthCache = new Map<string, number>();
  const onStack = new Set<string>();

  function depth(id: string): number {
    const cached = depthCache.get(id);
    if (cached !== undefined) return cached;
    // Cycle guard: if we re-enter an id mid-computation, treat it as depth 0
    // for the back-edge so the recursion terminates.
    if (onStack.has(id)) return 0;
    onStack.add(id);
    const deps = (byId.get(id)?.dependencies ?? []).filter(
      (d) => d !== id && ids.has(d),
    );
    const d = deps.length === 0 ? 0 : 1 + Math.max(...deps.map(depth));
    onStack.delete(id);
    depthCache.set(id, d);
    return d;
  }

  // Bucket systems by layer.
  const layers = new Map<number, LayoutSystem[]>();
  for (const s of systems) {
    const d = depth(s.id);
    const bucket = layers.get(d);
    if (bucket) bucket.push(s);
    else layers.set(d, [s]);
  }

  const result: Record<string, XY> = {};
  for (const [layer, members] of layers) {
    const sorted = [...members].sort((a, b) => a.name.localeCompare(b.name));
    sorted.forEach((s, i) => {
      result[s.id] = { x: i * COLUMN_WIDTH, y: layer * LAYER_HEIGHT };
    });
  }
  return result;
}
