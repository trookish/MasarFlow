/**
 * Canvas alignment + distribution utilities.
 *
 * Pure functions that take an array of React Flow nodes and return a map of
 * `id → { x, y }` new positions. The board applies them by updating RF state
 * and persisting to IndexedDB.
 */

import type { Node } from "@xyflow/react";

type Pos = { x: number; y: number };
type PosMap = Record<string, Pos>;

function nodeBox(n: Node): { left: number; top: number; right: number; bottom: number; cx: number; cy: number } {
  const w = n.width ?? (n.measured?.width ?? 280);
  const h = n.height ?? (n.measured?.height ?? 160);
  const left = n.position.x;
  const top = n.position.y;
  return {
    left,
    top,
    right: left + w,
    bottom: top + h,
    cx: left + w / 2,
    cy: top + h / 2,
  };
}

/* ── Alignment (aligns all selected nodes to a reference edge/center) ────── */

export function alignLeft(nodes: Node[]): PosMap {
  if (nodes.length < 2) return {};
  const minX = Math.min(...nodes.map((n) => nodeBox(n).left));
  return Object.fromEntries(nodes.map((n) => [n.id, { x: minX, y: n.position.y }]));
}

export function alignRight(nodes: Node[]): PosMap {
  if (nodes.length < 2) return {};
  const maxX = Math.max(...nodes.map((n) => nodeBox(n).right));
  return Object.fromEntries(
    nodes.map((n) => {
      const w = n.width ?? n.measured?.width ?? 280;
      return [n.id, { x: maxX - w, y: n.position.y }];
    }),
  );
}

export function alignTop(nodes: Node[]): PosMap {
  if (nodes.length < 2) return {};
  const minY = Math.min(...nodes.map((n) => nodeBox(n).top));
  return Object.fromEntries(nodes.map((n) => [n.id, { x: n.position.x, y: minY }]));
}

export function alignBottom(nodes: Node[]): PosMap {
  if (nodes.length < 2) return {};
  const maxY = Math.max(...nodes.map((n) => nodeBox(n).bottom));
  return Object.fromEntries(
    nodes.map((n) => {
      const h = n.height ?? n.measured?.height ?? 160;
      return [n.id, { x: n.position.x, y: maxY - h }];
    }),
  );
}

export function alignCenterH(nodes: Node[]): PosMap {
  if (nodes.length < 2) return {};
  const cx = nodes.reduce((sum, n) => sum + nodeBox(n).cx, 0) / nodes.length;
  return Object.fromEntries(
    nodes.map((n) => {
      const w = n.width ?? n.measured?.width ?? 280;
      return [n.id, { x: cx - w / 2, y: n.position.y }];
    }),
  );
}

export function alignCenterV(nodes: Node[]): PosMap {
  if (nodes.length < 2) return {};
  const cy = nodes.reduce((sum, n) => sum + nodeBox(n).cy, 0) / nodes.length;
  return Object.fromEntries(
    nodes.map((n) => {
      const h = n.height ?? n.measured?.height ?? 160;
      return [n.id, { x: n.position.x, y: cy - h / 2 }];
    }),
  );
}

/* ── Distribution (equal spacing between nodes) ──────────────────────────── */

export function distributeH(nodes: Node[]): PosMap {
  if (nodes.length < 3) return {};
  const sorted = [...nodes].sort((a, b) => nodeBox(a).left - nodeBox(b).left);
  const first = nodeBox(sorted[0]);
  const last = nodeBox(sorted[sorted.length - 1]);
  const totalSpan = last.right - first.left;
  const totalNodeWidth = sorted.reduce((sum, n) => sum + (n.width ?? n.measured?.width ?? 280), 0);
  const gap = (totalSpan - totalNodeWidth) / (sorted.length - 1);
  const result: PosMap = {};
  let cursor = first.left;
  for (const n of sorted) {
    const w = n.width ?? n.measured?.width ?? 280;
    result[n.id] = { x: cursor, y: n.position.y };
    cursor += w + gap;
  }
  return result;
}

export function distributeV(nodes: Node[]): PosMap {
  if (nodes.length < 3) return {};
  const sorted = [...nodes].sort((a, b) => nodeBox(a).top - nodeBox(b).top);
  const first = nodeBox(sorted[0]);
  const last = nodeBox(sorted[sorted.length - 1]);
  const totalSpan = last.bottom - first.top;
  const totalNodeHeight = sorted.reduce((sum, n) => sum + (n.height ?? n.measured?.height ?? 160), 0);
  const gap = (totalSpan - totalNodeHeight) / (sorted.length - 1);
  const result: PosMap = {};
  let cursor = first.top;
  for (const n of sorted) {
    const h = n.height ?? n.measured?.height ?? 160;
    result[n.id] = { x: n.position.x, y: cursor };
    cursor += h + gap;
  }
  return result;
}

/* ── Auto-grid (arrange nodes in a tidy grid) ────────────────────────────── */

export function autoGrid(nodes: Node[], cols = 3, gap = 40): PosMap {
  if (nodes.length === 0) return {};
  const result: PosMap = {};
  const maxW = Math.max(...nodes.map((n) => n.width ?? n.measured?.width ?? 280));
  const maxH = Math.max(...nodes.map((n) => n.height ?? n.measured?.height ?? 160));
  nodes.forEach((n, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    result[n.id] = {
      x: col * (maxW + gap),
      y: row * (maxH + gap),
    };
  });
  return result;
}

/* ── Z-order (bring forward / send backward) ─────────────────────────────── */

export function bringForward(nodes: Node[]): number {
  const maxZ = Math.max(...nodes.map((n) => n.zIndex ?? 0));
  return maxZ + 1;
}

export function sendBackward(nodes: Node[]): number {
  const minZ = Math.min(...nodes.map((n) => n.zIndex ?? 0));
  return minZ - 1;
}
