/**
 * Core types and panel-id helpers for the MasarFlow dock window manager.
 *
 * Pure TypeScript only — no React, Next, or DOM imports. A "panel id" is a
 * route path optionally followed by a query string (e.g. "/brain" or
 * "/brain?note=abc"); the query part is the per-panel selection snapshot.
 */

export type DockZone = "left" | "right" | "top" | "bottom" | "tab";

export type DockNode =
  // binary (exactly 2 children); ratio = first child's share, in [0.05, 0.95]
  | {
      type: "split";
      id: string;
      direction: "horizontal" | "vertical";
      ratio: number;
      children: DockNode[];
    }
  // pages = panel ids, unique, activePage ∈ pages
  | { type: "tabs"; id: string; activePage: string; pages: string[] }
  // pageId = panel id, e.g. "/brain" or "/brain?note=abc"
  | { type: "page"; id: string; pageId: string };

export interface FloatWindow {
  id: string;
  panelIds: string[];
  activePanel: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
  minimized: boolean;
  maximized: boolean;
}

export interface ProjectDockState {
  version: 1;
  activeWorkspace: string;
  workspaces: Record<
    string,
    { tree: DockNode; params: Record<string, string | undefined> }
  >;
  floaters: FloatWindow[];
  collapsedPanels: string[];
  maximizedPanelId: string | null;
  focusGroupId: string | null;
}

/** Split ratio bounds shared by validation, resizing, and geometry. */
export const MIN_RATIO = 0.05;
export const MAX_RATIO = 0.95;

/** Strip everything from the first "?" — "/brain?note=a" -> "/brain". */
export function pageIdOf(panelId: string): string {
  const cut = panelId.indexOf("?");
  return cut === -1 ? panelId : panelId.slice(0, cut);
}

/** Raw query part after "?" or "" when absent — "/brain?note=a" -> "note=a". */
export function paramsOf(panelId: string): string {
  const cut = panelId.indexOf("?");
  return cut === -1 ? "" : panelId.slice(cut + 1);
}

/** Join a path and a raw query — empty query yields the bare path. */
export function joinPanelId(path: string, query: string): string {
  return query === "" ? path : `${path}?${query}`;
}

/**
 * Unique id with an optional prefix, e.g. "split_ab12cd".
 * Uses crypto.randomUUID when available; falls back to Math.random.
 */
export function newId(prefix?: string): string {
  const random =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : `${Math.random().toString(36).slice(2)}${Math.random()
          .toString(36)
          .slice(2)}`
          .slice(0, 12);
  return prefix ? `${prefix}_${random}` : random;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasNonEmptyStringId(node: Record<string, unknown>): boolean {
  return typeof node.id === "string" && node.id.length > 0;
}

/**
 * Structural validation of a DockNode (used by serde before trusting a
 * persisted tree). Checks the invariants the types can't express: known node
 * type, non-empty string id, binary splits with ratio in [0.05, 0.95] and
 * recursively valid children, tabs with unique non-empty pages and an
 * activePage that is a member, page with a non-empty pageId.
 */
export function validateNode(
  node: unknown,
): { ok: boolean; error?: string } {
  if (!isRecord(node)) return { ok: false, error: "node is not an object" };
  if (!hasNonEmptyStringId(node)) return { ok: false, error: "missing id" };

  switch (node.type) {
    case "split": {
      if (
        node.direction !== "horizontal" &&
        node.direction !== "vertical"
      ) {
        return { ok: false, error: "split: invalid direction" };
      }
      const ratio = node.ratio;
      if (
        typeof ratio !== "number" ||
        Number.isNaN(ratio) ||
        ratio < MIN_RATIO ||
        ratio > MAX_RATIO
      ) {
        return {
          ok: false,
          error: "split: ratio must be a number in [0.05, 0.95]",
        };
      }
      if (!Array.isArray(node.children) || node.children.length !== 2) {
        return { ok: false, error: "split: must have exactly 2 children" };
      }
      for (const child of node.children) {
        const childResult = validateNode(child);
        if (!childResult.ok) return childResult;
      }
      return { ok: true };
    }
    case "tabs": {
      const pages = node.pages;
      if (
        !Array.isArray(pages) ||
        pages.length < 1 ||
        pages.some((p) => typeof p !== "string" || p.length === 0)
      ) {
        return { ok: false, error: "tabs: pages must be non-empty strings" };
      }
      if (new Set(pages).size !== pages.length) {
        return { ok: false, error: "tabs: duplicate pages" };
      }
      if (
        typeof node.activePage !== "string" ||
        !pages.includes(node.activePage)
      ) {
        return { ok: false, error: "tabs: activePage not in pages" };
      }
      return { ok: true };
    }
    case "page": {
      if (typeof node.pageId !== "string" || node.pageId.length === 0) {
        return { ok: false, error: "page: pageId must be a non-empty string" };
      }
      return { ok: true };
    }
    default:
      return { ok: false, error: `unknown node type: ${String(node.type)}` };
  }
}
