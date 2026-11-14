import { floatsInspector } from "@/lib/ui/archetype";

/**
 * Where the Inspector lives, decided from plain numbers so it is testable without React.
 *
 *   docked   a column beside the page, resizable; the preference `open` asks for it
 *   overlay  a floating panel over the page's right edge: used when the window is too narrow to dock
 *            and on board and canvas pages, whose content needs the full width (see lib/ui/archetype)
 *   hidden   not shown
 *
 * A selection never gets lost: when the user is not docked, a fresh selection `reveals` the overlay.
 */

export type InspectorPresentation = "docked" | "overlay" | "hidden";

/** Content width (px) below which the Inspector cannot sit beside a page. */
export const DOCK_MIN_CONTENT = 1000;
export const INSPECTOR_MIN_WIDTH = 280;
export const INSPECTOR_MAX_WIDTH = 480;
export const INSPECTOR_DEFAULT_WIDTH = 340;

export interface PresentationInput {
  /** The user's "show the Inspector" preference. */
  open: boolean;
  /** A transient reveal after a new selection or an explicit toggle. */
  revealed: boolean;
  /** The user pinned the Inspector as a column even on floating pages. */
  pinned: boolean;
  /** Width of the workspace area, in px (0 = not measured yet). */
  contentWidth: number;
  /** Section href of the focused tab (`/tasks`), or its page id. */
  pageHref: string;
}

export function canDock(input: Pick<PresentationInput, "pinned" | "contentWidth" | "pageHref">): boolean {
  if (input.contentWidth > 0 && input.contentWidth < DOCK_MIN_CONTENT) return false;
  return input.pinned || !floatsInspector(input.pageHref);
}

export function inspectorPresentation(input: PresentationInput): InspectorPresentation {
  if (input.open && canDock(input)) return "docked";
  return input.revealed ? "overlay" : "hidden";
}

export interface ToggleState {
  open: boolean;
  revealed: boolean;
}

/** What the topbar button does from the current presentation. */
export function toggleInspector(input: PresentationInput): ToggleState {
  const shown = inspectorPresentation(input);
  if (shown === "docked") return { open: false, revealed: false };
  if (shown === "overlay") return { open: input.open, revealed: false };
  return canDock(input) ? { open: true, revealed: false } : { open: input.open, revealed: true };
}

export function clampInspectorWidth(width: number): number {
  if (!Number.isFinite(width)) return INSPECTOR_DEFAULT_WIDTH;
  return Math.min(INSPECTOR_MAX_WIDTH, Math.max(INSPECTOR_MIN_WIDTH, Math.round(width)));
}
