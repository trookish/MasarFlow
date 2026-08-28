/**
 * Pure layout-tree operations for the MasarFlow dock window manager.
 *
 * Every function returns a NEW tree — the input is never mutated. All
 * mutations funnel through normalizeTree as the final step, so the tree
 * invariants (binary splits with ratio in [0.05, 0.95], tabs with unique
 * pages and activePage ∈ pages, no degenerate root) always hold afterwards.
 *
 * Pure TypeScript only — no React, Next, or DOM imports.
 */

import type { DockNode, DockZone } from "./types";
import { MAX_RATIO, MIN_RATIO, newId } from "./types";

// Re-exports for API compatibility with downstream modules.
export type { DockZone } from "./types";
export { newId } from "./types";

const PLACEHOLDER_PAGE_ID = "/dashboard";

/** Placeholder page node used when a tree would otherwise be empty. */
function placeholderPage(): DockNode {
  return { type: "page", id: newId("page"), pageId: PLACEHOLDER_PAGE_ID };
}

/**
 * Deep-clone a node. Hand-rolled (small trees, hot path) so only the fields
 * DockNode can have are copied.
 */
function cloneNode(node: DockNode): DockNode {
  switch (node.type) {
    case "split":
      return { ...node, children: node.children.map(cloneNode) };
    case "tabs":
      return { ...node, pages: [...node.pages] };
    case "page":
      return { ...node };
  }
}

/**
 * Rebuild a node bottom-up: map every node through `updater`, dropping
 * branches whose updater returns null (a page whose panel was removed, or a
 * tabs node emptied by removal). Parents always receive cloned children, so
 * the input tree is never mutated.
 */
function mapTree(
  node: DockNode,
  updater: (node: DockNode) => DockNode | null,
): DockNode | null {
  if (node.type === "split") {
    const kept: DockNode[] = [];
    for (const child of node.children) {
      const mapped = mapTree(child, updater);
      if (mapped !== null) kept.push(mapped);
    }
    return updater({ ...node, children: kept });
  }
  return updater(cloneNode(node));
}

/** mapTree variant that never drops nodes (for in-place rewrites). */
function mapTreeNoNulls(
  node: DockNode,
  updater: (node: DockNode) => DockNode,
): DockNode {
  return mapTree(node, (n) => updater(n)) as DockNode;
}

/** Collect pageIds into `acc` (depth-first, split child order). */
function collectPagesIn(node: DockNode, acc: string[]): void {
  switch (node.type) {
    case "split":
      for (const child of node.children) collectPagesIn(child, acc);
      break;
    case "tabs":
      acc.push(...node.pages);
      break;
    case "page":
      acc.push(node.pageId);
      break;
  }
}

/** All pageIds reachable from the tree (split + tabs.pages + page). */
export function collectPages(tree: DockNode): string[] {
  const acc: string[] = [];
  collectPagesIn(tree, acc);
  return acc;
}

/** Find a node by id. Returns null when absent. */
export function findNode(tree: DockNode, id: string): DockNode | null {
  if (tree.id === id) return tree;
  if (tree.type === "split") {
    for (const child of tree.children) {
      const hit = findNode(child, id);
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * The tabs/page node that currently holds `panelId` (tabs containing it in
 * pages, or the page node whose pageId it is). Null when absent.
 */
export function findHolder(tree: DockNode, panelId: string): DockNode | null {
  return findNodeContaining(tree, panelId);
}

function findNodeContaining(
  tree: DockNode,
  panelId: string,
): DockNode | null {
  if (tree.type === "split") {
    for (const child of tree.children) {
      const hit = findNodeContaining(child, panelId);
      if (hit) return hit;
    }
    return null;
  }
  if (tree.type === "tabs" && tree.pages.includes(panelId)) return tree;
  if (tree.type === "page" && tree.pageId === panelId) return tree;
  return null;
}

/**
 * True when `panelId` is the active page of the tabs node `nodeId`, or the
 * pageId of the page node `nodeId`.
 */
export function isFocusedIn(
  tree: DockNode,
  nodeId: string,
  panelId: string,
): boolean {
  const node = findNode(tree, nodeId);
  if (!node) return false;
  if (node.type === "tabs") return node.activePage === panelId;
  if (node.type === "page") return node.pageId === panelId;
  return false;
}

/** Set activePage in every tabs node that contains panelId. */
export function focusPanel(tree: DockNode, panelId: string): DockNode {
  return mapTreeNoNulls(tree, (node) => {
    if (node.type === "tabs" && node.pages.includes(panelId)) {
      return { ...node, activePage: panelId };
    }
    return node;
  });
}

/**
 * Remove panelId from wherever it lives and normalize.
 *
 * Closing the active tab activates the neighbor (previous preferred, else
 * next) BEFORE removal. Removing the last page of a group folds it to a
 * single page (normalize) or, when nothing remains, leaves the placeholder
 * "/dashboard" page node (via the normalize root guard).
 */
export function closePanel(tree: DockNode, panelId: string): DockNode {
  const normalized = mapTree(tree, (node) => {
    if (node.type === "tabs" && node.pages.includes(panelId)) {
      if (node.pages.length === 1) return null; // group dies with its last page
      const idx = node.pages.indexOf(panelId);
      const pages = node.pages.filter((p) => p !== panelId);
      // Neighbor activation: previous preferred, else the next remaining.
      const activePage =
        node.activePage === panelId
          ? idx > 0
            ? pages[idx - 1]
            : pages[0]
          : node.activePage;
      return { type: "tabs", id: node.id, activePage, pages };
    }
    if (node.type === "page" && node.pageId === panelId) {
      return null; // normalize replaces an emptied root with the placeholder
    }
    return node;
  });
  return normalized === null ? placeholderPage() : normalizeTree(normalized);
}

/**
 * Open `panelId` (a route path + optional query snapshot) in the tree.
 *
 * - If a node already contains panelId: focus it, focusGroupId = node id.
 * - Else insert into the focus-group tabs node (append + activate).
 * - Else if root is tabs: append + activate.
 * - Else if root is a bare page: replace root with tabs [old, new], active=new.
 * - Else (root is a split) keep the old root as the first child of a new
 *   split with the new page as the second child (ratio 0.5) — deterministic,
 *   no focus guess. focusGroupId = the id of the node now holding the panel.
 */
export function openPanel(
  tree: DockNode,
  panelId: string,
  focusGroupId: string | null,
): { tree: DockNode; focusGroupId: string | null } {
  const holder = findNodeContaining(tree, panelId);
  if (holder) {
    return { tree: focusPanel(tree, panelId), focusGroupId: holder.id };
  }

  const groupNode = focusGroupId ? findNode(tree, focusGroupId) : null;
  if (groupNode && groupNode.type === "tabs") {
    const withGroup = mapTreeNoNulls(tree, (node) =>
      node.type === "tabs" && node.id === focusGroupId
        ? { ...node, pages: [...node.pages, panelId], activePage: panelId }
        : node,
    );
    return { tree: withGroup, focusGroupId: focusGroupId };
  }

  // No focus group (or stale/non-tabs): fall through by root shape.
  if (tree.type === "tabs") {
    const next: DockNode = {
      type: "tabs",
      id: tree.id,
      activePage: panelId,
      pages: [...tree.pages, panelId],
    };
    return { tree: next, focusGroupId: tree.id };
  }

  if (tree.type === "page") {
    // Replace a bare page root with tabs [old, new], active = new.
    const group: DockNode = {
      type: "tabs",
      id: newId("tabs"),
      activePage: panelId,
      pages: [tree.pageId, panelId],
    };
    return { tree: group, focusGroupId: group.id };
  }

  // Root is a split and no focus group matched: wrap the old root.
  const pageNode: DockNode = {
    type: "page",
    id: newId("page"),
    pageId: panelId,
  };
  const wrapped: DockNode = {
    type: "split",
    id: newId("split"),
    direction: "horizontal",
    ratio: 0.5,
    children: [tree, pageNode],
  };
  return { tree: wrapped, focusGroupId: pageNode.id };
}

/** The panel ids carried by a payload node (tabs pages or a single page). */
function payloadPages(node: DockNode): string[] {
  if (node.type === "tabs") return [...node.pages];
  if (node.type === "page") return [node.pageId];
  return []; // splits are never payloads
}

/**
 * Insert the payload at the root for movePanel(target="root"):
 * - zone "tab": root becomes tabs [all reachable pages, ...payload], active = payload.
 * - left/top: split [payload, oldRoot]; right/bottom: split [oldRoot, payload].
 */
function insertAtRoot(base: DockNode, payload: DockNode, zone: DockZone): DockNode {
  if (zone === "tab") {
    return normalizeTree({
      type: "tabs",
      id: newId("tabs"),
      activePage: payloadPages(payload)[0] ?? "",
      pages: [...collectPages(base), ...payloadPages(payload)],
    });
  }
  const children =
    zone === "left" || zone === "top" ? [payload, base] : [base, payload];
  return {
    type: "split",
    id: newId("split"),
    direction: zone === "left" || zone === "right" ? "horizontal" : "vertical",
    ratio: 0.5,
    children,
  };
}

/**
 * Move a panel (or its whole source group, for group drags) to a target
 * node / the root, arriving from `zone`.
 *
 * - The source panel is removed from its current location FIRST; when it
 *   lived in a tabs group with more than one page, the WHOLE group moves.
 * - zone "tab": target becomes/already-is a tabs node; the payload is
 *   appended (deduped) and activated.
 * - zone left/right/top/bottom: the target is replaced with a binary split
 *   ([payload, target] for left/top, [target, payload] for right/bottom).
 * - target "root": the same at the root level.
 * - A stale target id falls back to a root insert (no page loss).
 */
export function movePanel(
  tree: DockNode,
  sourcePanelId: string,
  targetNodeId: string | "root",
  zone: DockZone,
): DockNode {
  const sourceGroup = findNodeContaining(tree, sourcePanelId);
  if (!sourceGroup) return normalizeTree(tree); // nothing to move

  const wholeGroup = sourceGroup.type === "tabs" && sourceGroup.pages.length > 1;

  // Payload: the whole group (fresh tabs node) or the lone page node,
  // keeping the source node's id for key/focus stability.
  const payload: DockNode =
    wholeGroup && sourceGroup.type === "tabs"
      ? {
          type: "tabs",
          id: sourceGroup.id,
          activePage: sourcePanelId,
          pages: [...sourceGroup.pages],
        }
      : { type: "page", id: sourceGroup.id, pageId: sourcePanelId };

  // Remove the source from the tree first.
  let base: DockNode;
  if (wholeGroup && sourceGroup.type === "tabs") {
    let without = tree;
    for (const p of sourceGroup.pages) without = closePanel(without, p);
    base = without;
  } else {
    base = closePanel(tree, sourcePanelId);
  }

  // The source was the only content: the payload REPLACES the placeholder
  // root wholesale (the placeholder must never survive as a sibling).
  const isPlaceholderRoot =
    base.type === "page" && base.pageId === PLACEHOLDER_PAGE_ID;
  if (isPlaceholderRoot) {
    return normalizeTree(payload);
  }

  if (targetNodeId === "root") return insertAtRoot(base, payload, zone);

  const target = findNode(base, targetNodeId);
  if (!target) return insertAtRoot(base, payload, zone); // stale target fallback

  if (zone === "tab") {
    return normalizeTree(
      mapTreeNoNulls(base, (node) => {
        if (node.id !== targetNodeId) return node;
        if (node.type === "tabs") {
          // Merge ALL payload pages (group drag), deduped, then activate.
          const pages = [...node.pages];
          for (const p of payloadPages(payload)) {
            if (!pages.includes(p)) pages.push(p);
          }
          return { type: "tabs", id: node.id, activePage: sourcePanelId, pages };
        }
        if (node.type === "page" && node.pageId !== sourcePanelId) {
          const incoming = payloadPages(payload).filter(
            (p) => p !== node.pageId,
          );
          return {
            type: "tabs",
            id: node.id,
            activePage: sourcePanelId,
            pages: [node.pageId, ...incoming],
          };
        }
        return node;
      }),
    );
  }

  // zone left/right/top/bottom: replace the target leaf/group with a split.
  return normalizeTree(
    mapTreeNoNulls(base, (node) => {
      if (node.id !== targetNodeId) return node;
      if (node.type === "split") return node; // splits are not split targets
      const children =
        zone === "left" || zone === "top"
          ? [payload, node]
          : [node, payload];
      return {
        type: "split",
        id: newId("split"),
        direction:
          zone === "left" || zone === "right" ? "horizontal" : "vertical",
        ratio: 0.5,
        children,
      };
    }),
  );
}

/**
 * Set the ratio of the targeted split, clamped to [MIN_RATIO, MAX_RATIO].
 * Non-split targets are returned unchanged.
 */
export function resizeSplit(
  tree: DockNode,
  nodeId: string,
  ratio: number,
): DockNode {
  const clamped = Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio));
  return mapTreeNoNulls(tree, (node) =>
    node.type === "split" && node.id === nodeId ? { ...node, ratio: clamped } : node,
  );
}

/**
 * Move panelId within the tabs node's pages to `index` (clamped) and make it
 * the active tab. Non-matching nodes are returned unchanged.
 */
export function reorderTab(
  tree: DockNode,
  nodeId: string,
  panelId: string,
  index: number,
): DockNode {
  return mapTreeNoNulls(tree, (node) => {
    if (node.type !== "tabs" || node.id !== nodeId) return node;
    if (!node.pages.includes(panelId)) return node;
    const without = node.pages.filter((p) => p !== panelId);
    const at = Math.max(0, Math.min(without.length, index));
    const pages = [...without.slice(0, at), panelId, ...without.slice(at)];
    return { type: "tabs", id: node.id, activePage: panelId, pages };
  });
}

/**
 * Cleanup pass, applied after every mutation:
 * - split with 0 children (guard; cannot occur via the binary invariant)
 *   -> placeholder page node "/dashboard"
 * - split with 1 child -> that child (it keeps its own id)
 * - tabs with 1 page -> folded to a `page` node KEEPING the tabs id
 * - root must never be a degenerate split
 */
export function normalizeTree(tree: DockNode): DockNode {
  switch (tree.type) {
    case "split": {
      const children = tree.children.map(normalizeTree);
      if (children.length === 0) return placeholderPage();
      if (children.length === 1) return children[0];
      return { ...tree, children };
    }
    case "tabs": {
      if (tree.pages.length === 1) {
        // Fold in place, keep the id so React keys/focusGroupId stay stable.
        return { type: "page", id: tree.id, pageId: tree.pages[0] };
      }
      return tree;
    }
    case "page":
      return tree;
  }
}

/**
 * Insert a payload node (from a floater — NOT currently in the tree) at
 * `target` ("root" or node id) arriving from `zone`. Same insertion
 * semantics as movePanel, minus the removal step:
 * - zone "tab": merge the payload's pages into the target tabs node (or
 *   convert a bare page target) and activate the payload's active page.
 * - left/top: replace the target with split [payload, target];
 *   right/bottom: split [target, payload].
 * - target "root": wrap at the root level.
 * - A placeholder-only root is REPLACED by the payload on a tab-merge (the
 *   placeholder must not become a group member).
 * - A stale target falls back to a root insert (no payload loss).
 */
export function insertPanel(
  tree: DockNode,
  payload: DockNode,
  targetNodeId: string | "root",
  zone: DockZone,
): DockNode {
  const isPlaceholderRoot =
    tree.type === "page" && tree.pageId === PLACEHOLDER_PAGE_ID;

  // Placeholder root: the payload REPLACES the tree wholesale (the
  // placeholder must never become a group member or split sibling).
  if (isPlaceholderRoot) return normalizeTree(payload);

  if (targetNodeId === "root") {
    return insertAtRoot(tree, payload, zone);
  }

  const target = findNode(tree, targetNodeId);
  if (!target) return insertAtRoot(tree, payload, zone);

  if (zone === "tab") {
    return normalizeTree(
      mapTreeNoNulls(tree, (node) => {
        if (node.id !== targetNodeId) return node;
        if (node.type === "tabs") {
          const pages = [...node.pages];
          for (const p of payloadPages(payload)) {
            if (!pages.includes(p)) pages.push(p);
          }
          return {
            type: "tabs",
            id: node.id,
            activePage: payloadPages(payload)[0] ?? node.activePage,
            pages,
          };
        }
        if (node.type === "page" && node.pageId !== PLACEHOLDER_PAGE_ID) {
          return {
            type: "tabs",
            id: node.id,
            activePage: payloadPages(payload)[0] ?? node.pageId,
            pages: [node.pageId, ...payloadPages(payload)],
          };
        }
        return node;
      }),
    );
  }

  // Edge zones: replace the target with a binary split around the payload.
  return normalizeTree(
    mapTreeNoNulls(tree, (node) => {
      if (node.id !== targetNodeId) return node;
      if (node.type === "split") return node;
      const children =
        zone === "left" || zone === "top" ? [payload, node] : [node, payload];
      return {
        type: "split",
        id: newId("split"),
        direction:
          zone === "left" || zone === "right" ? "horizontal" : "vertical",
        ratio: 0.5,
        children,
      };
    }),
  );
}
