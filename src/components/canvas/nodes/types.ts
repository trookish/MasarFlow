/**
 * Shared types for canvas node components. Each node type carries its own
 * `data` payload shape but shares a common envelope (color, edit callbacks,
 * LOD state) so the board can treat them uniformly.
 */

export interface BaseNodeData {
  [key: string]: unknown;
  /** Tailwind/bg color string, mapped from Obsidian palette or custom hex. */
  color?: string;
  /** Whether to render card shadows (from CanvasSettings.cardShadows). */
  shadow?: boolean;
  /** Called when a node's data payload changes, to persist to IndexedDB. */
  onDataChange?: (id: string, data: Record<string, unknown>) => void;
  /** Called when a note-link node should open the full note editor. */
  onOpenNote?: (noteId: string) => void;
}

export interface TextNodeData extends BaseNodeData {
  text: string;
}

export interface NoteNodeData extends BaseNodeData {
  noteId: string;
  title: string;
  excerpt: string;
  body?: string;
  mode?: "preview" | "editable" | "readonly" | "heading";
}

export interface MediaNodeData extends BaseNodeData {
  attachmentId?: string;
  /** Obsidian vault path (when media comes from sync, not attachment store). */
  vaultPath?: string;
  name: string;
  mimeType?: string;
  /** For client-side URL-attached media (e.g. pasted image data URLs). */
  dataUrl?: string;
}

export interface WebNodeData extends BaseNodeData {
  url: string;
  title: string;
  description?: string;
  favicon?: string;
  thumbnail?: string;
  /** Detected embed kind — drives which renderer the node uses. */
  kind?: "youtube" | "video" | "article" | "github" | "generic";
  /** Cached embed metadata from the /api/canvas/embed proxy. */
  embedHtml?: string;
  readerText?: string;
}

export interface GroupNodeData extends BaseNodeData {
  label: string;
  collapsed?: boolean;
}

/** Union of all canvas node data shapes, keyed by DB type. */
export type CanvasNodeData =
  | TextNodeData
  | NoteNodeData
  | MediaNodeData
  | WebNodeData
  | GroupNodeData;

/* ── Helpers ─────────────────────────────────────────────────────────────── */

/** The 6 Obsidian palette colors as hex, for node background tints. */
export const NODE_COLOR_HEX: Record<string, string> = {
  "1": "#fb464c",
  "2": "#e9973f",
  "3": "#e0de71",
  "4": "#44d7a6",
  "5": "#53dfdd",
  "6": "#a882ff",
};

/** Resolve a color token (Obsidian palette key or hex) to a soft bg class. */
export function nodeColorStyle(color?: string): React.CSSProperties {
  if (!color) return {};
  const hex = NODE_COLOR_HEX[color] ?? color;
  return {
    backgroundColor: `color-mix(in srgb, ${hex} 12%, var(--card))`,
    borderColor: `color-mix(in srgb, ${hex} 40%, var(--border))`,
  };
}

/** Detect the web embed kind from a URL string (no network needed). */
export function detectWebKind(url: string): WebNodeData["kind"] {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be" || (host === "youtube.com" && u.pathname === "/watch") || host === "youtube-nocookie.com") {
      return "youtube";
    }
    if (host === "youtube.com" && u.pathname.startsWith("/embed/")) {
      return "youtube";
    }
    if (host === "github.com") {
      return "github";
    }
    // Common video providers
    if (["vimeo.com", "dailymotion.com", "twitch.tv"].includes(host)) {
      return "video";
    }
    return "article";
  } catch {
    return "generic";
  }
}

/** Extract a YouTube video ID from any YouTube URL form. */
export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return u.pathname.slice(1) || null;
    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      if (u.pathname.startsWith("/embed/")) return u.pathname.split("/")[2] ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

import type React from "react";
