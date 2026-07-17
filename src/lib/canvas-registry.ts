/**
 * Plugin-extensible canvas node-type registry.
 *
 * The canvas ships with 5 built-in node types (text, note, media, web, group).
 * This registry lets plugins register *custom* card types — new visual cards
 * with their own rendering, data shape, and toolbar entries — without touching
 * the core canvas code.
 *
 * ## How a plugin registers a custom card type
 *
 * ```ts
 * import { canvasNodeRegistry } from "@/lib/canvas-registry";
 *
 * canvasNodeRegistry.register({
 *   rfType: "kanbanCard",
 *   dbType: "kanban",       // stored in CanvasNode.type
 *   label: "Kanban card",
 *   icon: "kanban",          // lucide icon key
 *   component: KanbanCardNode, // a React Flow NodeProps component
 *   defaultProps: { columns: [] },
 *   defaultSize: { width: 320, height: 400 },
 * });
 * ```
 *
 * The board picks up registered types at render time via `resolveNodeTypes()`,
 * which merges built-in types with any plugin-registered ones.
 *
 * ## Why a singleton, not React context?
 *
 * Node types are static component references — they don't change at runtime
 * per-project. A module-level singleton with `register()` is simpler than a
 * provider and works identically. Plugins call `register()` at import time
 * (their module is loaded by the plugin runtime), and the board reads the
 * merged map when it renders.
 */

import type { ComponentType } from "react";
import type { NodeTypes, NodeProps, Node } from "@xyflow/react";

/* ── Types ───────────────────────────────────────────────────────────────── */

/** A custom canvas card type definition, registered by a plugin. */
export interface CanvasCardTypeDef {
  /** The React Flow `type` string used on Node objects. Must be unique. */
  rfType: string;
  /** The DB `CanvasNode.type` value. Must be unique and ≤ 16 chars. */
  dbType: string;
  /** Human-readable label shown in the add-panel and context menu. */
  label: string;
  /** Lucide icon key (resolved by the icon resolver in the view layer). */
  icon: string;
  /** The React Flow node component that renders this card type. */
  component: ComponentType<NodeProps<Node<Record<string, unknown>>>>;
  /** Default data payload when a card of this type is created. */
  defaultProps?: Record<string, unknown>;
  /** Default card dimensions. */
  defaultSize?: { width: number; height: number };
  /** Whether this card type appears in the add-panel (default: true). */
  showInPanel?: boolean;
}

interface RegistryEntry extends CanvasCardTypeDef {
  builtIn: boolean;
}

/* ── Registry ─────────────────────────────────────────────────────────────── */

const entries = new Map<string, RegistryEntry>();

/** Built-in type keys (reserved — plugins cannot override them). */
export const BUILT_IN_RF_TYPES = [
  "textNode",
  "noteNode",
  "mediaNode",
  "webNode",
  "groupNode",
] as const;

/** Register a custom canvas card type. Throws on duplicate or reserved keys. */
export function registerCanvasCardType(def: CanvasCardTypeDef): void {
  if (BUILT_IN_RF_TYPES.includes(def.rfType as (typeof BUILT_IN_RF_TYPES)[number])) {
    throw new Error(`Cannot register: "${def.rfType}" is a reserved built-in type.`);
  }
  if (entries.has(def.rfType)) {
    throw new Error(`Cannot register: a card type with rfType "${def.rfType}" already exists.`);
  }
  entries.set(def.rfType, { ...def, builtIn: false });
}

/** Remove a registered custom card type (e.g. when a plugin is uninstalled). */
export function unregisterCanvasCardType(rfType: string): void {
  entries.delete(rfType);
}

/** All registered custom card types (excludes built-ins). */
export function customCardTypes(): CanvasCardTypeDef[] {
  return Array.from(entries.values())
    .filter((e) => !e.builtIn)
    .map(({ builtIn: _builtIn, ...rest }) => {
      void _builtIn;
      return rest;
    });
}

/** Look up a card type definition by its React Flow type string. */
export function getCardType(rfType: string): CanvasCardTypeDef | undefined {
  const entry = entries.get(rfType);
  if (!entry) return undefined;
  const { builtIn: _builtIn, ...rest } = entry;
  void _builtIn;
  return rest;
}

/** Look up a card type by its DB type string. */
export function getCardTypeByDbType(dbType: string): CanvasCardTypeDef | undefined {
  for (const entry of entries.values()) {
    if (entry.dbType === dbType) return getCardType(entry.rfType);
  }
  return undefined;
}

/**
 * Merge built-in React Flow node types with any plugin-registered ones,
 * producing the `nodeTypes` prop for `<ReactFlow>`.
 *
 * @param builtIns The built-in `{ textNode, noteNode, ... }` map from the
 *   canvas node components. Passed in to avoid a circular import
 *   (the registry is in `lib/`, the components are in `components/`).
 */
export function resolveNodeTypes(
  builtIns: NodeTypes,
): NodeTypes {
  const custom: NodeTypes = {};
  for (const entry of entries.values()) {
    if (!entry.builtIn) {
      custom[entry.rfType] = entry.component as NodeTypes[string];
    }
  }
  return { ...builtIns, ...custom };
}

/**
 * Resolve a DB `CanvasNode.type` to a React Flow `type` string, checking
 * both built-ins and plugin-registered types.
 */
export function resolveRfType(
  dbType: string,
  builtInMap: Record<string, string>,
): string {
  // Check built-ins first.
  if (builtInMap[dbType]) return builtInMap[dbType];
  // Check custom types.
  const custom = getCardTypeByDbType(dbType);
  if (custom) return custom.rfType;
  // Fallback.
  return "textNode";
}

/** Clear all registered types (for tests). */
export function clearRegistry(): void {
  entries.clear();
}

/* ── Built-in registration (called by nodes/index.ts) ────────────────────── */

/** Register built-in types. Called once at module load by nodes/index.ts. */
export function registerBuiltIns(
  builtIns: Record<string, CanvasCardTypeDef>,
): void {
  for (const def of Object.values(builtIns)) {
    entries.set(def.rfType, { ...def, builtIn: true });
  }
}
