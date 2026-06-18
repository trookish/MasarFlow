import type { NoteType } from "@/lib/db/schema";

/**
 * Literal Tailwind class names per type. They must be written out in full so
 * the Tailwind v4 scanner can generate them. Colors come from the `--node-*`
 * tokens defined in globals.css, so they respect the active theme.
 */
export const NOTE_TYPE_DOT: Record<NoteType, string> = {
  idea: "bg-node-idea",
  system: "bg-node-system",
  mechanic: "bg-node-mechanic",
  research: "bg-node-research",
  experiment: "bg-node-experiment",
  note: "bg-node-note",
  lore: "bg-node-lore",
  decision: "bg-node-decision",
};

/** Knowledge-graph node kinds: note types plus cross-entity kinds. */
export type GraphKind = NoteType | "spec" | "task" | "system" | "commit";

/** CSS variable name backing each graph kind (for SVG fill/stroke). */
export const GRAPH_VAR: Record<GraphKind, string> = {
  idea: "--node-idea",
  system: "--node-system",
  mechanic: "--node-mechanic",
  research: "--node-research",
  experiment: "--node-experiment",
  note: "--node-note",
  lore: "--node-lore",
  decision: "--node-decision",
  spec: "--node-spec",
  task: "--node-task",
  commit: "--node-commit",
};

export const GRAPH_KIND_LABEL: Record<GraphKind, string> = {
  idea: "Idea",
  system: "System note",
  mechanic: "Mechanic",
  research: "Research",
  experiment: "Experiment",
  note: "Note",
  lore: "Lore",
  decision: "Decision",
  spec: "Spec",
  task: "Task",
  commit: "Commit",
};
