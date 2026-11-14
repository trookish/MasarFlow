import { create } from "zustand";
import type { EntityRef } from "@/lib/entities/registry";

/** A read-only summary a page publishes for something that is not a database entity (a graph node, a file). */
export interface InspectorCard {
  /** Stable id of what is selected; a new key reveals the Inspector. */
  key: string;
  kicker: string;
  title: string;
  rows: Array<{ label: string; value: string }>;
  /** Related entities, rendered as chips. */
  links?: EntityRef[];
  /** One short sentence under the title. */
  note?: string;
}

export interface InspectorSelection {
  ref?: EntityRef | null;
  card?: InspectorCard | null;
}

export function selectionKey(sel: InspectorSelection | null | undefined): string | null {
  if (!sel) return null;
  if (sel.ref) return `${sel.ref.kind}:${sel.ref.id}`;
  return sel.card?.key ?? null;
}

interface InspectorSelectionState {
  /** Selection per surface route ("/library"): each tab keeps its own, so switching tabs never loses it. */
  selections: Record<string, InspectorSelection>;
  /** Transient: show the Inspector as an overlay even when it is not docked. */
  revealed: boolean;
  /** Transient: measured width of the workspace area, written by the shell. */
  contentWidth: number;
  setContentWidth: (width: number) => void;
  select: (surfaceRoute: string, selection: InspectorSelection | null) => void;
  setRevealed: (revealed: boolean) => void;
}

export const useInspectorSelection = create<InspectorSelectionState>()((set) => ({
  selections: {},
  revealed: false,
  contentWidth: 0,
  setContentWidth: (contentWidth) => set((s) => (s.contentWidth === contentWidth ? s : { contentWidth })),
  select: (surfaceRoute, selection) =>
    set((s) => {
      const next = { ...s.selections };
      if (selection) next[surfaceRoute] = selection;
      else delete next[surfaceRoute];
      return { selections: next };
    }),
  setRevealed: (revealed) => set({ revealed }),
}));
