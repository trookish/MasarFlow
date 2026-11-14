import { SURFACES } from "@/lib/navigation/surfaces";

/**
 * The layouts every page picks from. The archetype is the page's promise about how its content
 * behaves (a board scrolls sideways, a document scrolls one column), and the shell reads it to decide
 * whether the Inspector may take a column away from the content.
 */
export type Archetype =
  | "list-detail"
  | "board"
  | "document"
  | "canvas"
  | "dashboard"
  | "session"
  | "settings"
  | "terminal";

/** One archetype per surface section. A new section must be listed here (enforced by a unit test). */
export const SECTION_ARCHETYPES: Readonly<Record<string, Archetype>> = {
  "/today": "dashboard",
  "/dashboard": "dashboard",
  "/brain": "list-detail",
  "/brain/canvas": "canvas",
  "/brain/templates": "list-detail",
  "/files": "list-detail",
  "/tasks": "board",
  "/specs": "list-detail",
  "/sprints": "board",
  "/devlogs": "list-detail",
  "/docs": "list-detail",
  "/standards": "list-detail",
  "/architecture": "canvas",
  "/knowledge": "canvas",
  "/search": "list-detail",
  "/chat": "session",
  "/agents": "list-detail",
  "/workflow": "list-detail",
  "/settings": "settings",
  "/control-center": "dashboard",
  "/git": "dashboard",
  "/sync": "list-detail",
  "/watcher": "list-detail",
  "/plugins": "list-detail",
  "/tools/terminal": "terminal",
  "/tools/logs": "terminal",
  "/tools/system": "dashboard",
};

/** Archetypes whose content needs the full width: the Inspector floats over them unless pinned. */
export const FLOATING_ARCHETYPES: ReadonlySet<Archetype> = new Set<Archetype>(["board", "canvas"]);

export function archetypeOf(href: string): Archetype | null {
  return SECTION_ARCHETYPES[href] ?? null;
}

/** True when the Inspector should float over this section rather than take a column beside it. */
export function floatsInspector(href: string): boolean {
  const archetype = archetypeOf(href);
  return archetype !== null && FLOATING_ARCHETYPES.has(archetype);
}

/**
 * Sections of the AI surface. Choosing a session or an agent there is navigation, not inspection,
 * so a selection never reveals the Inspector over them.
 */
export const AI_SECTIONS: ReadonlySet<string> = new Set(
  SURFACES.find((s) => s.id === "ai")?.sections.map((section) => section.href) ?? [],
);
