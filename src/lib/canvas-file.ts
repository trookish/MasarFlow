/**
 * Obsidian-compatible `.canvas` file adapter.
 *
 * MasarFlow canvases persist to IndexedDB for the live workspace, but they can
 * be exported to (and imported from) a `.canvas` file — the JSON format used by
 * Obsidian Canvas. This makes boards portable, git-friendly, and interoperable
 * with the Obsidian vaults the Sync Panel already indexes.
 *
 * The Obsidian canvas schema is intentionally simple:
 *
 *   { nodes: [...], edges: [...] }
 *
 * where each node has `type: "text" | "file" | "link" | "group"` plus
 * `id/x/y/width/height/color` and a type-specific field (`text`, `file`,
 * `url`, `label`). Edges use `fromNode`/`toNode` + `fromSide`/`toSide`.
 *
 * MasarFlow-only state (node `data` payloads, edge handles, viewport, canvas
 * metadata) is preserved losslessly in a namespaced `masarflow` bag on each
 * record and at the root, so a MasarFlow → file → MasarFlow round trip loses
 * nothing. Importing a foreign Obsidian file still works — the `masarflow` bag
 * is simply absent and defaults fill in.
 */

import type { Canvas, CanvasNode, CanvasEdge } from "@/lib/db/schema";

/* ── Obsidian canvas JSON shapes ─────────────────────────────────────────── */

export interface ObsidianCanvasNode {
  id: string;
  type: "text" | "file" | "link" | "group";
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  /** text nodes */
  text?: string;
  /** file nodes (vault path) */
  file?: string;
  /** link nodes */
  url?: string;
  /** file/link/group label */
  label?: string;
  /** group background style (Obsidian: "cover" | "contain" | "repeat") */
  background?: string;
  /** group background image path */
  backgroundImage?: string;
  /** MasarFlow-only payload, preserved across round trips. */
  masarflow?: Record<string, unknown>;
}

export interface ObsidianCanvasEdge {
  id?: string;
  fromNode: string;
  fromSide?: "top" | "right" | "bottom" | "left";
  fromEnd?: "arrow" | "none";
  toNode: string;
  toSide?: "top" | "right" | "bottom" | "left";
  toEnd?: "arrow" | "none";
  label?: string;
  color?: string;
  /** MasarFlow-only payload, preserved across round trips. */
  masarflow?: Record<string, unknown>;
}

export interface ObsidianCanvasFile {
  nodes?: ObsidianCanvasNode[];
  edges?: ObsidianCanvasEdge[];
  /** MasarFlow root-level metadata (viewport, version, canvas info). */
  masarflow?: {
    formatVersion?: number;
    canvasName?: string;
    canvasDescription?: string;
    viewport?: { x: number; y: number; zoom: number };
  };
}

/* ── MasarFlow import inputs (ids preserved for edge linking) ────────────── */

export interface CanvasNodeInput {
  id?: string;
  type: CanvasNode["type"];
  x: number;
  y: number;
  width: number;
  height: number;
  data: Record<string, unknown>;
  color: string;
}

export interface CanvasEdgeInput {
  id?: string;
  source: string;
  target: string;
  sourceHandle: string | null;
  targetHandle: string | null;
  label: string;
  color: string;
}

export interface ImportedCanvas {
  name: string;
  description: string;
  nodes: CanvasNodeInput[];
  edges: CanvasEdgeInput[];
}

/* ── Obsidian color palette → hex (best-effort, theme-agnostic) ──────────── */

const OBSIDIAN_PALETTE: Record<string, string> = {
  "1": "#fb464c", // red
  "2": "#e9973f", // orange
  "3": "#e0de71", // yellow
  "4": "#44d7a6", // green
  "5": "#53dfdd", // cyan
  "6": "#a882ff", // purple
};

function colorToObsidian(hex: string): string | undefined {
  if (!hex) return undefined;
  const match = Object.entries(OBSIDIAN_PALETTE).find(
    ([, h]) => h.toLowerCase() === hex.toLowerCase(),
  );
  return match?.[0];
}

function colorFromObsidian(raw: string | undefined): string {
  if (!raw) return "";
  return OBSIDIAN_PALETTE[raw] ?? raw;
}

/* ── Handle ↔ side mapping (React Flow Position uses the same names) ─────── */

function handleToSide(handle: string | null | undefined) {
  if (handle === "left" || handle === "right" || handle === "top" || handle === "bottom") {
    return handle;
  }
  return undefined;
}

/* ── Export: MasarFlow canvas → Obsidian canvas file ─────────────────────── */

export function toCanvasFile(
  canvas: Pick<Canvas, "name"> & { description?: string },
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  viewport?: { x: number; y: number; zoom: number },
): ObsidianCanvasFile {
  const outNodes: ObsidianCanvasNode[] = nodes.map((n) => {
    const data = n.data ?? {};
    const base = {
      id: n.id,
      x: Math.round(n.x),
      y: Math.round(n.y),
      width: Math.round(n.width),
      height: Math.round(n.height),
      color: colorToObsidian(n.color) ?? (n.color || undefined),
    };
    switch (n.type) {
      case "text":
        return {
          ...base,
          type: "text",
          text: String(data.text ?? ""),
          masarflow: { data },
        };
      case "note":
        return {
          ...base,
          type: "file",
          file: String(data.noteId ?? ""),
          label: String(data.title ?? ""),
          masarflow: { data },
        };
      case "media":
        return {
          ...base,
          type: "file",
          file: String(data.attachmentId ?? data.src ?? ""),
          label: String(data.name ?? ""),
          masarflow: { data },
        };
      case "link":
        return {
          ...base,
          type: "link",
          url: String(data.url ?? ""),
          label: String(data.title ?? ""),
          masarflow: { data },
        };
      case "group":
        return {
          ...base,
          type: "group",
          label: String(data.label ?? data.title ?? ""),
          masarflow: { data },
        };
      default:
        return { ...base, type: "text", text: "", masarflow: { data } };
    }
  });

  const outEdges: ObsidianCanvasEdge[] = edges.map((e) => ({
    id: e.id,
    fromNode: e.source,
    fromSide: handleToSide(e.sourceHandle),
    fromEnd: "none",
    toNode: e.target,
    toSide: handleToSide(e.targetHandle),
    toEnd: "arrow",
    label: e.label || undefined,
    color: colorToObsidian(e.color) ?? (e.color || undefined),
    masarflow: { sourceHandle: e.sourceHandle, targetHandle: e.targetHandle },
  }));

  return {
    nodes: outNodes,
    edges: outEdges,
    masarflow: {
      formatVersion: 1,
      canvasName: canvas.name,
      canvasDescription: canvas.description ?? "",
      viewport,
    },
  };
}

/* ── Import: Obsidian canvas file → MasarFlow canvas inputs ──────────────── */

export function fromCanvasFile(
  json: ObsidianCanvasFile,
  fallbackName = "Imported canvas",
): ImportedCanvas {
  const rawNodes = json.nodes ?? [];
  const rawEdges = json.edges ?? [];

  const nodes: CanvasNodeInput[] = rawNodes.map((n) => {
    const color = colorFromObsidian(n.color);
    const mfBag = (n.masarflow ?? {}) as Record<string, unknown>;
    const mfData = (mfBag.data as Record<string, unknown> | undefined) ?? {};
    const w = n.width ?? 240;
    const h = n.height ?? 140;

    switch (n.type) {
      case "text":
        return {
          id: n.id,
          type: "text",
          x: n.x,
          y: n.y,
          width: w,
          height: h,
          color,
          data: { text: n.text ?? String(mfData.text ?? ""), ...mfData },
        };
      case "file":
        // A file node may be a MasarFlow note (has noteId) or media (attachmentId).
        if (typeof mfData.noteId === "string") {
          return {
            id: n.id,
            type: "note",
            x: n.x,
            y: n.y,
            width: w,
            height: h,
            color,
            data: { ...mfData, noteId: mfData.noteId, title: n.label ?? String(mfData.title ?? "") },
          };
        }
        if (typeof mfData.attachmentId === "string" || typeof mfData.src === "string") {
          return {
            id: n.id,
            type: "media",
            x: n.x,
            y: n.y,
            width: w,
            height: h,
            color,
            data: { ...mfData, name: n.label ?? String(mfData.name ?? "") },
          };
        }
        // Foreign Obsidian file node: keep as a note stub referencing the path.
        return {
          id: n.id,
          type: "note",
          x: n.x,
          y: n.y,
          width: w,
          height: h,
          color,
          data: { ...mfData, file: n.file ?? "", title: n.label ?? (n.file ?? "File").split("/").pop() ?? "File" },
        };
      case "link":
        return {
          id: n.id,
          type: "link",
          x: n.x,
          y: n.y,
          width: w,
          height: h,
          color,
          data: { ...mfData, url: n.url ?? "", title: n.label ?? "" },
        };
      case "group":
        return {
          id: n.id,
          type: "group",
          x: n.x,
          y: n.y,
          width: w,
          height: h,
          color,
          data: { ...mfData, label: n.label ?? String(mfData.label ?? "Group") },
        };
      default:
        return {
          id: n.id,
          type: "text",
          x: n.x,
          y: n.y,
          width: w,
          height: h,
          color,
          data: { text: "" },
        };
    }
  });

  const edges: CanvasEdgeInput[] = rawEdges.map((e) => {
    const mfBag = (e.masarflow ?? {}) as Record<string, unknown>;
    return {
      id: e.id,
      source: e.fromNode,
      target: e.toNode,
      sourceHandle: (mfBag.sourceHandle as string | null) ?? (handleToSide(e.fromSide) ?? null),
      targetHandle: (mfBag.targetHandle as string | null) ?? (handleToSide(e.toSide) ?? null),
      label: e.label ?? "",
      color: colorFromObsidian(e.color),
    };
  });

  return {
    name: json.masarflow?.canvasName ?? fallbackName,
    description: json.masarflow?.canvasDescription ?? "",
    nodes,
    edges,
  };
}

/* ── (De)serialization helpers ───────────────────────────────────────────── */

export function serializeCanvas(file: ObsidianCanvasFile): string {
  return JSON.stringify(file, null, 2);
}

export function parseCanvasFile(text: string): ObsidianCanvasFile {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid .canvas file: expected a JSON object.");
  }
  const file = parsed as ObsidianCanvasFile;
  if (!Array.isArray(file.nodes)) file.nodes = [];
  if (!Array.isArray(file.edges)) file.edges = [];
  return file;
}
