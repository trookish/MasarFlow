/**
 * Drop validation for the dock's pointer drag & drop.
 *
 * The reducers in tree.ts are forgiving by design (a stale target falls back
 * to a root insert so no page is ever lost); the UI must not *offer* a drop
 * whose outcome would surprise the user. This module is the single judge:
 * the workspace asks it before highlighting a target, and the DnD controller
 * asks it again before committing.
 *
 * Refused drops:
 * - no target / "outside": the pointer is not over the workspace
 * - stale target: the node id is not in the current tree
 * - split target: movePanel skips split targets, so committing would return
 *   the tree WITHOUT the payload (the panel disappears from the layout)
 * - self: the target is the dragged group itself — an edge drop there lands in
 *   movePanel's root fallback (silent position loss), a tab drop is a no-op
 * - no-op tab merge: the target group already holds every dragged page
 *
 * Pure TypeScript only — no React, Next, or DOM imports.
 */

import type { DockNode, DockZone } from "./types";
import { findHolder, findNode } from "./tree";

export type DropSource =
  | { kind: "panel"; panelId: string; nodeId?: string }
  | { kind: "group"; nodeId: string }
  | { kind: "floater"; floaterId: string; panelIds?: string[] };

export type DropVerdict = { ok: true } | { ok: false; reason: string };

const OK: DropVerdict = { ok: true };

/** The group a drag would move out of the tree, or null. */
function sourceGroup(tree: DockNode, source: DropSource): DockNode | null {
  if (source.kind === "floater") return null;
  const node =
    source.kind === "panel" ? findHolder(tree, source.panelId) : findNode(tree, source.nodeId);
  if (!node || node.type === "split") return null;
  return node;
}

/** Every panel the drag would move (a multi-page group moves as a whole). */
export function draggedPanels(tree: DockNode, source: DropSource): string[] {
  const group = sourceGroup(tree, source);
  if (!group) return [];
  if (group.type === "tabs") return [...group.pages];
  if (group.type === "page") return [group.pageId];
  return [];
}

/** The node id the drag would remove from the tree, or null. */
export function draggedNodeId(tree: DockNode, source: DropSource): string | null {
  return sourceGroup(tree, source)?.id ?? null;
}

/** Decide whether a drop may be committed. */
export function dropVerdict(
  tree: DockNode,
  source: DropSource,
  targetId: string | null,
  zone: DockZone | null,
): DropVerdict {
  if (!targetId || !zone) {
    return { ok: false, reason: "Release over free space or a drop zone." };
  }
  if (targetId === "outside") {
    return { ok: false, reason: "Dropped outside the workspace." };
  }
  if (targetId === "root") return OK;

  const node = findNode(tree, targetId);
  if (!node) {
    return { ok: false, reason: "The layout changed during the drag — try again." };
  }
  if (node.type === "split") {
    return { ok: false, reason: "Drop on a panel or its tabs, not on a divider." };
  }

  const self = draggedNodeId(tree, source);
  if (self && self === targetId) {
    return {
      ok: false,
      reason:
        zone === "tab"
          ? "These panels are already in this group."
          : "A panel cannot be docked next to itself.",
    };
  }

  if (zone === "tab") {
    // A floater's payload is carried by the drag ({panelIds}); a tree drag's
    // payload is derived from the tree. An unknown-but-non-empty payload is
    // accepted — the reducer dedupes pages anyway.
    const dragged =
      source.kind === "floater" ? (source.panelIds ?? []) : draggedPanels(tree, source);
    if (source.kind !== "floater" && dragged.length === 0) {
      return { ok: false, reason: "Nothing to move." };
    }
    const targetPages = node.type === "tabs" ? node.pages : [node.pageId];
    if (dragged.length > 0 && dragged.every((panelId) => targetPages.includes(panelId))) {
      return { ok: false, reason: "These panels are already in this group." };
    }
  }

  return OK;
}
