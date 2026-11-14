import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceRadial,
  forceSimulation,
  forceX,
  forceY,
  type Force,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";

/** The four forces exposed as sliders. */
export interface ForceSettings {
  /** Pull toward the centre. */
  center: number;
  /** Repulsion between nodes. */
  repel: number;
  /** Strength of the springs along edges. */
  link: number;
  /** Rest length of an edge, in world units. */
  distance: number;
}

export const DEFAULT_FORCES: ForceSettings = { center: 0.04, repel: 260, link: 0.4, distance: 74 };

export const FORCE_LIMITS: Record<keyof ForceSettings, { min: number; max: number; step: number }> = {
  center: { min: 0, max: 0.3, step: 0.01 },
  repel: { min: 0, max: 800, step: 10 },
  link: { min: 0, max: 1, step: 0.05 },
  distance: { min: 20, max: 300, step: 2 },
};

export function sanitizeForces(input: Partial<ForceSettings> | undefined): ForceSettings {
  const out = { ...DEFAULT_FORCES };
  for (const key of Object.keys(FORCE_LIMITS) as Array<keyof ForceSettings>) {
    const v = input?.[key];
    if (typeof v === "number" && Number.isFinite(v)) {
      out[key] = Math.min(FORCE_LIMITS[key].max, Math.max(FORCE_LIMITS[key].min, v));
    }
  }
  return out;
}

export interface LayoutNode extends SimulationNodeDatum {
  key: string;
  x: number;
  y: number;
}

export type Seed = ReadonlyMap<string, readonly [number, number]>;

export interface LayoutOptions {
  forces?: ForceSettings;
  /** Pull nodes onto a ring instead of a blob. */
  radial?: boolean;
  /** Previously saved positions. Nodes with a seed keep it; the rest are placed around it. */
  seed?: Seed;
  maxTicks?: number;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Small stable pseudo-random value in [0, 1) for a string (placement of new nodes). */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/**
 * A force-directed layout that is stepped by the caller, a few milliseconds per frame, so a large
 * graph never blocks input. It is deterministic: d3-force's tie-breaking jitter uses a fixed seed
 * and the starting positions are computed, not random, so the same graph lays out the same way.
 *
 * With a complete `seed` the layout is settled immediately and no tick runs, which is how saved
 * positions come back unchanged. With a partial seed the seeded nodes stay pinned while new nodes
 * find a place around their neighbours.
 */
export class GraphLayout {
  readonly nodes: LayoutNode[];
  private readonly byKey = new Map<string, LayoutNode>();
  private readonly sim: Simulation<LayoutNode, SimulationLinkDatum<LayoutNode>>;
  private readonly link: ReturnType<typeof forceLink<LayoutNode, SimulationLinkDatum<LayoutNode>>>;
  private readonly charge: ReturnType<typeof forceManyBody<LayoutNode>>;
  private readonly pullX: ReturnType<typeof forceX<LayoutNode>>;
  private readonly pullY: ReturnType<typeof forceY<LayoutNode>>;
  private readonly pinned = new Set<string>();
  private readonly maxTicks: number;
  private ticks = 0;
  private done = false;
  private forces: ForceSettings;

  constructor(
    keys: readonly string[],
    edges: ReadonlyArray<{ source: string; target: string }>,
    opts: LayoutOptions = {},
  ) {
    this.forces = opts.forces ?? DEFAULT_FORCES;
    this.maxTicks = opts.maxTicks ?? 320;
    const seed = opts.seed;

    this.nodes = keys.map((key, i) => {
      const saved = seed?.get(key);
      let x: number;
      let y: number;
      if (saved) {
        x = saved[0];
        y = saved[1];
      } else {
        const r = 10 * Math.sqrt(0.5 + i);
        const a = i * GOLDEN_ANGLE;
        x = r * Math.cos(a);
        y = r * Math.sin(a);
      }
      const node: LayoutNode = { key, x, y };
      this.byKey.set(key, node);
      return node;
    });

    const links: Array<SimulationLinkDatum<LayoutNode>> = [];
    const adj = new Map<string, string[]>();
    for (const e of edges) {
      if (!this.byKey.has(e.source) || !this.byKey.has(e.target) || e.source === e.target) continue;
      links.push({ source: e.source, target: e.target });
      (adj.get(e.source) ?? adj.set(e.source, []).get(e.source)!).push(e.target);
      (adj.get(e.target) ?? adj.set(e.target, []).get(e.target)!).push(e.source);
    }

    let missing = 0;
    if (seed && seed.size > 0) {
      for (const n of this.nodes) {
        if (seed.has(n.key)) {
          this.pinned.add(n.key);
          n.fx = n.x;
          n.fy = n.y;
        } else {
          missing++;
        }
      }
      // A new node starts beside its seeded neighbours (or at a stable offset from the origin).
      for (const n of this.nodes) {
        if (this.pinned.has(n.key)) continue;
        let sx = 0;
        let sy = 0;
        let c = 0;
        for (const other of adj.get(n.key) ?? []) {
          const o = this.byKey.get(other)!;
          if (this.pinned.has(other)) {
            sx += o.x;
            sy += o.y;
            c++;
          }
        }
        const angle = hash01(n.key) * Math.PI * 2;
        if (c > 0) {
          n.x = sx / c + Math.cos(angle) * this.forces.distance;
          n.y = sy / c + Math.sin(angle) * this.forces.distance;
        }
      }
    }

    this.link = forceLink<LayoutNode, SimulationLinkDatum<LayoutNode>>(links)
      .id((d) => d.key)
      .distance(this.forces.distance)
      .strength(this.forces.link);
    this.charge = forceManyBody<LayoutNode>().strength(-this.forces.repel);
    this.pullX = forceX<LayoutNode>(0).strength(this.forces.center);
    this.pullY = forceY<LayoutNode>(0).strength(this.forces.center);

    this.sim = forceSimulation<LayoutNode>(this.nodes)
      .force("charge", this.charge)
      .force("link", this.link)
      .force("x", this.pullX)
      .force("y", this.pullY)
      .force("collide", forceCollide<LayoutNode>(16))
      .alphaDecay(0.03)
      .stop();
    if (opts.radial) {
      const radius = 120 + 12 * Math.sqrt(this.nodes.length);
      this.sim.force("radial", forceRadial<LayoutNode>(radius, 0, 0).strength(0.55) as Force<LayoutNode, never>);
    }

    if (this.nodes.length === 0 || (seed && seed.size > 0 && missing === 0)) {
      this.done = true;
      this.sim.alpha(0);
      this.releasePins();
    } else if (seed && seed.size > 0) {
      this.sim.alpha(0.4);
    }
  }

  /** True once the layout has cooled (or hit its tick cap). */
  get settled(): boolean {
    return this.done;
  }

  get alpha(): number {
    return this.sim.alpha();
  }

  get tickCount(): number {
    return this.ticks;
  }

  node(key: string): LayoutNode | undefined {
    return this.byKey.get(key);
  }

  /**
   * Run ticks until the time budget is spent or the layout settles. Returns the number of ticks
   * run. `now` is injectable for tests.
   */
  step(budgetMs: number, now: () => number = defaultNow): number {
    if (this.done) return 0;
    const start = now();
    let n = 0;
    do {
      this.sim.tick();
      n++;
      this.ticks++;
      if (this.sim.alpha() < this.sim.alphaMin() || this.ticks >= this.maxTicks) {
        this.finish();
        break;
      }
    } while (now() - start < budgetMs);
    return n;
  }

  /** Run to completion synchronously (tests and small graphs). */
  runToEnd(): void {
    while (!this.done) this.step(Infinity, () => 0);
  }

  /** Warm the simulation up again, e.g. after a drag or a force change. */
  reheat(alpha = 0.3): void {
    this.done = false;
    this.ticks = 0;
    this.sim.alpha(Math.max(this.sim.alpha(), alpha));
  }

  /** Hold a node at a fixed position (dragging). */
  fix(key: string, x: number, y: number): void {
    const n = this.byKey.get(key);
    if (!n) return;
    n.fx = x;
    n.fy = y;
    n.x = x;
    n.y = y;
  }

  release(key: string): void {
    const n = this.byKey.get(key);
    if (n && !this.pinned.has(key)) {
      n.fx = null;
      n.fy = null;
    }
  }

  setForces(forces: ForceSettings): void {
    this.forces = forces;
    this.link.distance(forces.distance).strength(forces.link);
    this.charge.strength(-forces.repel);
    this.pullX.strength(forces.center);
    this.pullY.strength(forces.center);
  }

  positions(): Record<string, [number, number]> {
    const out: Record<string, [number, number]> = {};
    for (const n of this.nodes) out[n.key] = [Math.round(n.x * 10) / 10, Math.round(n.y * 10) / 10];
    return out;
  }

  dispose(): void {
    this.sim.stop();
  }

  private finish(): void {
    this.done = true;
    this.releasePins();
  }

  private releasePins(): void {
    for (const key of this.pinned) {
      const n = this.byKey.get(key)!;
      n.fx = null;
      n.fy = null;
    }
    this.pinned.clear();
  }
}

function defaultNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/** Bounds of the node positions, or null when empty. */
export function layoutBounds(nodes: ReadonlyArray<{ x: number; y: number }>): {
  x: number;
  y: number;
  width: number;
  height: number;
} | null {
  if (nodes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x > maxX) maxX = n.x;
    if (n.y > maxY) maxY = n.y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
