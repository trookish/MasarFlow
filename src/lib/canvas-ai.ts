/**
 * Canvas AI automation seam.
 *
 * This module defines the operations an AI agent can perform on a canvas,
 * without coupling the canvas to any specific AI provider. The chat agent,
 * workflow pipeline, or a future plugin can call these operations to
 * auto-generate, arrange, or summarize canvas content.
 *
 * ## Design
 *
 * The canvas board exposes a `CanvasAIContext` — a set of imperative
 * operations that AI tools can invoke. The board registers these operations
 * via a ref or context provider; the AI layer reads them and calls them.
 *
 * This is a *seam*, not a full implementation — the operations are wired
 * to the existing board functions (addNode, autoGrid, etc.), but the AI
 * integration (prompt → operation calls) is left to the chat/workflow layer.
 */

/* ── Operations an AI can perform ────────────────────────────────────────── */

export interface CanvasAIOperation {
  /** Add a text card with the given content at an optional position. */
  addTextCard(text: string, pos?: { x: number; y: number }): Promise<string>;
  /** Add a note card linked to an existing note. */
  addNoteCard(noteId: string, title: string, excerpt: string): Promise<string>;
  /** Add a web embed card from a URL. */
  addWebCard(url: string): Promise<string>;
  /** Add a group container with a label. */
  addGroup(label: string): Promise<string>;
  /** Auto-arrange all (or selected) nodes into a tidy grid. */
  autoArrange(selectedOnly?: boolean): void;
  /** Connect two nodes with an edge. */
  connect(fromId: string, toId: string, label?: string): Promise<string>;
  /** Delete a node by id. */
  deleteNode(id: string): void;
  /** Get all node ids and their titles/first-lines (for AI context). */
  summarize(): CanvasNodeSummary[];
}

/** Lightweight summary of a canvas node — enough for AI to reason about. */
export interface CanvasNodeSummary {
  id: string;
  type: string;
  title: string;
  position: { x: number; y: number };
}

/** A snapshot of the canvas state that AI can read. */
export interface CanvasAISnapshot {
  canvasId: string | null;
  canvasName: string;
  nodeCount: number;
  edgeCount: number;
  nodes: CanvasNodeSummary[];
}

/**
 * The full context object the canvas board exposes to AI layers.
 * The board sets this on a module-level ref; the AI layer reads it.
 */
export type CanvasAIContext = CanvasAIOperation & CanvasAISnapshot;

/* ── Module-level ref (set by the board, read by AI layers) ──────────────── */

let activeContext: CanvasAIContext | null = null;

/** Set the active canvas AI context (called by the board on mount). */
export function setCanvasAIContext(ctx: CanvasAIContext | null): void {
  activeContext = ctx;
}

/** Get the active canvas AI context (called by AI layers). */
export function getCanvasAIContext(): CanvasAIContext | null {
  return activeContext;
}

/* ── High-level AI operations (built on the low-level seam) ──────────────── */

/**
 * Generate a mind-map from a central idea: creates a root text card and
 * N branch cards arranged in a radial pattern around it.
 *
 * This is a pure function that returns the operations to perform — the caller
 * (chat agent / workflow) executes them via the CanvasAIContext.
 */
export function planMindMap(
  centralIdea: string,
  branches: string[],
): Array<{ type: "addText"; text: string; pos: { x: number; y: number } }> {
  const root = { type: "addText" as const, text: centralIdea, pos: { x: 0, y: 0 } };
  const radius = 300;
  const ops = branches.map((branch, i) => {
    const angle = (i / branches.length) * Math.PI * 2;
    return {
      type: "addText" as const,
      text: branch,
      pos: {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      },
    };
  });
  return [root, ...ops];
}

/**
 * Plan an auto-summary: given a set of node summaries, produce a single
 * "summary card" text that aggregates their titles. The AI layer would
 * call an LLM to produce richer text; this is the structural skeleton.
 */
export function planSummaryCard(nodes: CanvasNodeSummary[]): string {
  const titles = nodes.map((n) => `- ${n.title}`).join("\n");
  return `## Summary\n\n${titles}\n\n_${nodes.length} cards summarized_`;
}
