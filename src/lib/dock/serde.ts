/**
 * Serde + validation for persisted dock layouts.
 *
 * The persisted JSON is untrusted (localStorage): parseProjectState either
 * returns a fully valid ProjectDockState or null — it never throws and never
 * returns a partial state, so callers fall back to defaults on null.
 *
 * Before validation every payload is migrated to DOCK_STATE_VERSION:
 * a payload written by an older build is repaired field-by-field (canonical
 * params, tree invariants, floater geometry, dangling references) and then
 * validated. Payloads of an unknown version are returned unchanged and
 * therefore fail validation -> defaults. Repair is strictly better than the
 * previous all-or-nothing behaviour, where a single hand-edited key discarded
 * the whole layout.
 *
 * The node invariants (binary splits, ratio range, unique pages, activePage
 * membership) are checked by validateNode from types.ts and reused here so
 * serde and programmatic construction agree on one rule set.
 *
 * Pure TypeScript only — no React, Next, or DOM imports.
 */

import { z } from "zod";
import type { DockNode, FloatWindow, ProjectDockState } from "./types";
import { MAX_RATIO, MIN_RATIO, validateNode } from "./types";
import { collectPages, findNode, normalizeTree } from "./tree";

/** Current persisted schema version. Bump this and add a step to `migrate`. */
export const DOCK_STATE_VERSION = 2;

/** Repair bounds for floaters persisted by 0.2 (folded into the tab strip on load). */
const MIN_FLOATER_WIDTH = 280;
const MIN_FLOATER_HEIGHT = 160;
/** Absurd geometry from hand edits is clamped to a plausible virtual desktop. */
const MAX_FLOATER_EXTENT = 6000;

/**
 * The shape of a DockNode, validated structurally (not field-by-field) via
 * validateNode. z.lazy handles the recursion; the refine enforces the
 * invariants the type system cannot express.
 */
export const dockNodeSchema: z.ZodType<DockNode> = z.lazy(() =>
  z
    .any()
    .refine((v) => validateNode(v).ok, { message: "invalid dock node" }),
);

const floatWindowSchema = z.object({
  id: z.string().min(1),
  panelIds: z.array(z.string().min(1)).min(1),
  activePanel: z.string().min(1),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite(),
  height: z.number().finite(),
  z: z.number().finite(),
  minimized: z.boolean(),
  maximized: z.boolean(),
});

const workspaceSchema = z.object({
  tree: dockNodeSchema,
  params: z.record(z.string(), z.union([z.string(), z.undefined()])),
});

export const projectDockStateSchema: z.ZodType<ProjectDockState> = z.object({
  version: z.literal(DOCK_STATE_VERSION),
  activeWorkspace: z.string(),
  workspaces: z.record(z.string(), workspaceSchema),
  floaters: z.array(floatWindowSchema),
  collapsedPanels: z.array(z.string()),
  maximizedPanelId: z.union([z.string(), z.null()]),
  focusGroupId: z.union([z.string(), z.null()]),
});

// ── Repair helpers (payload -> payload, never throws) ───────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** v1 could persist a query that still carried its "?" — "/x" + "?a=b". */
function canonicalQuery(value: string): string {
  return value.startsWith("?") ? value.slice(1) : value;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.length > 0 && !out.includes(item)) {
      out.push(item);
    }
  }
  return out;
}

/**
 * Repair one node. Returns null when nothing is recoverable (wrong shape,
 * empty pages, unknown type). Splits are re-folded onto the binary invariant:
 * one surviving child -> that child; three or more -> the first two survive
 * (a 3-way split cannot be represented, and dropping the tail is visible in
 * the layout rather than fatal).
 */
function repairNode(raw: unknown): DockNode | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id);
  if (!id) return null;

  switch (raw.type) {
    case "split": {
      const children = Array.isArray(raw.children)
        ? raw.children
            .map(repairNode)
            .filter((child): child is DockNode => child !== null)
        : [];
      if (children.length === 0) return null;
      if (children.length === 1) return children[0];
      return {
        type: "split",
        id,
        direction: raw.direction === "vertical" ? "vertical" : "horizontal",
        ratio: clampNumber(finite(raw.ratio, 0.5), MIN_RATIO, MAX_RATIO),
        children: children.slice(0, 2),
      };
    }
    case "tabs": {
      const pages = stringList(raw.pages);
      if (pages.length === 0) return null;
      const wanted = str(raw.activePage);
      const activePage = wanted && pages.includes(wanted) ? wanted : pages[0];
      // Fold single-page groups exactly like normalizeTree does (id kept).
      if (pages.length === 1) return { type: "page", id, pageId: pages[0] };
      return { type: "tabs", id, activePage, pages };
    }
    case "page": {
      const pageId = str(raw.pageId);
      return pageId ? { type: "page", id, pageId } : null;
    }
    default:
      return null;
  }
}

function repairTree(raw: unknown): DockNode | null {
  const node = repairNode(raw);
  return node ? normalizeTree(node) : null;
}

function repairFloater(raw: unknown, index: number): FloatWindow | null {
  if (!isRecord(raw)) return null;
  const panelIds = stringList(raw.panelIds);
  if (panelIds.length === 0) return null;
  const wanted = str(raw.activePanel);
  return {
    id: str(raw.id) ?? `float_repaired_${index}`,
    panelIds,
    activePanel: wanted && panelIds.includes(wanted) ? wanted : panelIds[0],
    x: clampNumber(finite(raw.x, 40), 0, MAX_FLOATER_EXTENT),
    y: clampNumber(finite(raw.y, 40), 0, MAX_FLOATER_EXTENT),
    width: clampNumber(finite(raw.width, 560), MIN_FLOATER_WIDTH, MAX_FLOATER_EXTENT),
    height: clampNumber(finite(raw.height, 420), MIN_FLOATER_HEIGHT, MAX_FLOATER_EXTENT),
    z: index + 1,
    minimized: raw.minimized === true,
    maximized: raw.maximized === true,
  };
}

/**
 * Bring a persisted payload up to DOCK_STATE_VERSION.
 * - version 1 -> 2: repair trees, canonicalize + prune params, clamp floater
 *   geometry, re-base z-order, clear dangling activeWorkspace / maximized /
 *   focusGroupId / collapsed references.
 * - any other version: returned untouched (validation decides).
 * Never throws.
 */
export function migrate(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  if (raw.version !== 1) return raw;

  const workspaces: Record<string, unknown> = {};
  if (isRecord(raw.workspaces)) {
    for (const [name, entry] of Object.entries(raw.workspaces)) {
      if (name.length === 0 || !isRecord(entry)) continue;
      const tree = repairTree(entry.tree);
      if (!tree) continue;
      workspaces[name] = { tree, params: isRecord(entry.params) ? { ...entry.params } : {} };
    }
  }
  const names = Object.keys(workspaces);
  if (names.length === 0) return raw; // nothing repairable -> validation rejects

  const floaters = Array.isArray(raw.floaters)
    ? raw.floaters
        .map((floater, index) => repairFloater(floater, index))
        .filter((floater): floater is FloatWindow => floater !== null)
    : [];

  // Every panel id known to the payload: trees + floaters.
  const panels = new Set<string>();
  for (const name of names) {
    const entry = workspaces[name] as { tree: DockNode };
    for (const panelId of collectPages(entry.tree)) panels.add(panelId);
  }
  for (const floater of floaters) for (const id of floater.panelIds) panels.add(id);

  for (const name of names) {
    const entry = workspaces[name] as { tree: DockNode; params: Record<string, unknown> };
    const params: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(entry.params)) {
      if (typeof value !== "string" || !panels.has(key)) continue;
      params[key] = canonicalQuery(value);
    }
    workspaces[name] = { tree: entry.tree, params };
  }

  const wantWorkspace = str(raw.activeWorkspace);
  const activeWorkspace =
    wantWorkspace && workspaces[wantWorkspace] ? wantWorkspace : names[0];
  const activeTree = (workspaces[activeWorkspace] as { tree: DockNode }).tree;

  const collapsed = stringList(raw.collapsedPanels).filter((id) => panels.has(id));
  const maximized = str(raw.maximizedPanelId);
  const focus = str(raw.focusGroupId);

  return {
    version: DOCK_STATE_VERSION,
    activeWorkspace,
    workspaces,
    floaters,
    collapsedPanels: collapsed,
    maximizedPanelId: maximized && panels.has(maximized) ? maximized : null,
    focusGroupId: focus && findNode(activeTree, focus) ? focus : null,
  };
}

/** Parse untrusted persisted JSON into a ProjectDockState, or null. */
export function parseProjectState(raw: unknown): ProjectDockState | null {
  const result = projectDockStateSchema.safeParse(migrate(raw));
  return result.success ? result.data : null;
}
