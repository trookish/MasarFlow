/**
 * Canvas node type registry.
 *
 * Built-in node types are registered with the plugin-extensible registry
 * (src/lib/canvas-registry.ts) at module load. Plugins can register
 * additional custom card types via `registerCanvasCardType()`.
 */

import type { NodeTypes } from "@xyflow/react";
import { TextNode } from "./text-node";
import { NoteNode } from "./note-node";
import { MediaNode } from "./media-node";
import { WebNode } from "./web-node";
import { GroupNode } from "./group-node";
import {
  resolveNodeTypes,
  resolveRfType,
  registerBuiltIns,
  customCardTypes,
} from "@/lib/canvas-registry";

/* ── Built-in type definitions ───────────────────────────────────────────── */

const BUILT_IN_DEFS = {
  textNode: {
    rfType: "textNode",
    dbType: "text",
    label: "Text card",
    icon: "type",
    component: TextNode as never,
    defaultSize: { width: 280, height: 160 },
  },
  noteNode: {
    rfType: "noteNode",
    dbType: "note",
    label: "Note card",
    icon: "file-text",
    component: NoteNode as never,
    defaultSize: { width: 280, height: 160 },
  },
  mediaNode: {
    rfType: "mediaNode",
    dbType: "media",
    label: "Media card",
    icon: "image",
    component: MediaNode as never,
    defaultSize: { width: 280, height: 200 },
  },
  webNode: {
    rfType: "webNode",
    dbType: "link",
    label: "Web page card",
    icon: "globe",
    component: WebNode as never,
    defaultSize: { width: 320, height: 200 },
  },
  groupNode: {
    rfType: "groupNode",
    dbType: "group",
    label: "Group container",
    icon: "box",
    component: GroupNode as never,
    defaultSize: { width: 400, height: 300 },
  },
};

// Register built-ins once at module load.
registerBuiltIns(BUILT_IN_DEFS);

/* ── Built-in RF type map (for the board's nodeTypes prop) ───────────────── */

const builtInNodeTypes: NodeTypes = {
  textNode: TextNode,
  noteNode: NoteNode,
  mediaNode: MediaNode,
  webNode: WebNode,
  groupNode: GroupNode,
};

/**
 * The node types prop for `<ReactFlow>`, merged with any plugin-registered
 * custom types. The board calls this at render time.
 */
export const canvasNodeTypes: NodeTypes = resolveNodeTypes(builtInNodeTypes);

/** Built-in DB type → RF type mapping. */
const BUILT_IN_TYPE_MAP: Record<string, string> = {
  text: "textNode",
  note: "noteNode",
  media: "mediaNode",
  link: "webNode",
  group: "groupNode",
};

/** Map a DB CanvasNode.type to a React Flow node `type` string. */
export function rfTypeFor(dbType: string): string {
  return resolveRfType(dbType, BUILT_IN_TYPE_MAP);
}

/** Inverse: React Flow type → DB type. */
export function dbTypeFor(rfType: string): CanvasNodeType {
  for (const [db, rf] of Object.entries(BUILT_IN_TYPE_MAP)) {
    if (rf === rfType) return db as CanvasNodeType;
  }
  // Check custom types registered by plugins.
  const custom = customCardTypes().find((c) => c.rfType === rfType);
  if (custom) return custom.dbType as CanvasNodeType;
  return "text";
}

export type CanvasNodeType = "text" | "note" | "media" | "link" | "group" | string;

export { TextNode, NoteNode, MediaNode, WebNode, GroupNode };
