/**
 * Serde + validation for persisted dock layouts.
 *
 * The persisted JSON is untrusted (localStorage): parseProjectState either
 * returns a fully valid ProjectDockState or null — it never throws and never
 * returns a partial state, so callers fall back to defaults on null.
 *
 * The node invariants (binary splits, ratio range, unique pages, activePage
 * membership) are checked by validateNode from types.ts and reused here so
 * serde and programmatic construction agree on one rule set.
 *
 * Pure TypeScript only — no React, Next, or DOM imports.
 */

import { z } from "zod";
import type { DockNode, ProjectDockState } from "./types";
import { validateNode } from "./types";

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
  version: z.literal(1),
  activeWorkspace: z.string(),
  workspaces: z.record(z.string(), workspaceSchema),
  floaters: z.array(floatWindowSchema),
  collapsedPanels: z.array(z.string()),
  maximizedPanelId: z.union([z.string(), z.null()]),
  focusGroupId: z.union([z.string(), z.null()]),
});

/** Parse untrusted persisted JSON into a ProjectDockState, or null. */
export function parseProjectState(raw: unknown): ProjectDockState | null {
  const result = projectDockStateSchema.safeParse(raw);
  return result.success ? result.data : null;
}

/**
 * Version migrations. v1 is current; when the schema evolves, match on the
 * old version here and return an upgraded payload.
 */
export function migrate(raw: unknown): unknown {
  // TODO(dock): add migrations when ProjectDockState version bumps past 1.
  return raw;
}
