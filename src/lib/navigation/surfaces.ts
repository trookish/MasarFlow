import {
  CalendarDays,
  PenTool,
  Sparkles,
  KanbanSquare,
  BookOpen,
  MonitorCog,
  type LucideIcon,
} from "lucide-react";

/**
 * The six workspace surfaces. Each section renders its existing page by route, so a surface is a
 * labelled host rather than a duplicate view. Legacy routes redirect to the canonical surface URL.
 */
export interface SurfaceSection {
  id: string;
  label: string;
  /** The page this section hosts (a key of the dock's PAGE_COMPONENTS). */
  href: string;
}

export interface Surface {
  id: SurfaceId;
  label: string;
  route: string;
  icon: LucideIcon;
  /** One line shown under the surface title and in the collapsed sidebar tooltip. */
  description: string;
  sections: SurfaceSection[];
}

export type SurfaceId = "today" | "capture" | "work" | "library" | "ai" | "system";

export const SURFACES: Surface[] = [
  {
    id: "today",
    label: "Today",
    route: "/today",
    icon: CalendarDays,
    description: "What needs attention now across the active project.",
    sections: [
      { id: "focus", label: "Focus", href: "/today" },
      { id: "dashboard", label: "Dashboard", href: "/dashboard" },
    ],
  },
  {
    id: "capture",
    label: "Capture",
    route: "/capture",
    icon: PenTool,
    description: "Write notes, sketch on canvases and keep project files.",
    sections: [
      { id: "notes", label: "Notes", href: "/brain" },
      { id: "canvas", label: "Canvas", href: "/brain/canvas" },
      { id: "templates", label: "Templates", href: "/brain/templates" },
      { id: "files", label: "Files", href: "/files" },
    ],
  },
  {
    id: "work",
    label: "Work",
    route: "/work",
    icon: KanbanSquare,
    description: "Plan and track tasks, specifications, sprints and the dev log.",
    sections: [
      { id: "board", label: "Task Boards", href: "/tasks" },
      { id: "specs", label: "Specifications", href: "/specs" },
      { id: "sprints", label: "Sprints", href: "/sprints" },
      { id: "log", label: "Dev Logs", href: "/devlogs" },
    ],
  },
  {
    id: "library",
    label: "Library",
    route: "/library",
    icon: BookOpen,
    description: "Reference material: documentation, standards, architecture and the knowledge graph.",
    sections: [
      { id: "docs", label: "Documentation", href: "/docs" },
      { id: "standards", label: "Standards", href: "/standards" },
      { id: "architecture", label: "Architecture", href: "/architecture" },
      { id: "graph", label: "Knowledge Graph", href: "/knowledge" },
      { id: "search", label: "Semantic Search", href: "/search" },
    ],
  },
  {
    id: "ai",
    label: "AI",
    route: "/ai",
    icon: Sparkles,
    description: "Sessions, agents and automations for the active project.",
    sections: [
      { id: "chat", label: "Sessions", href: "/chat" },
      { id: "agents", label: "Agents", href: "/agents" },
      { id: "workflow", label: "Automations", href: "/workflow" },
    ],
  },
  {
    id: "system",
    label: "System",
    route: "/system",
    icon: MonitorCog,
    description: "Repository, sync, features, tools and settings.",
    sections: [
      { id: "settings", label: "Settings", href: "/settings" },
      { id: "control-center", label: "Control Center", href: "/control-center" },
      { id: "git", label: "Git", href: "/git" },
      { id: "sync", label: "Sync Panel", href: "/sync" },
      { id: "watcher", label: "Project Watcher", href: "/watcher" },
      { id: "features", label: "Features", href: "/plugins" },
      { id: "terminal", label: "Terminal", href: "/tools/terminal" },
      { id: "logs", label: "Logs", href: "/tools/logs" },
      { id: "system-info", label: "System Info", href: "/tools/system" },
    ],
  },
];

/** Legacy routes that render the same component as another section. */
export const ALIASES: Record<string, string> = { "/brain/graph": "/knowledge" };

export const SURFACE_ROUTES = new Set(SURFACES.map((s) => s.route));

export function getSurface(id: string): Surface | undefined {
  return SURFACES.find((s) => s.id === id);
}

/** The surface and section that host a legacy route (exact match after aliasing). */
export function locate(pathname: string): { surface: Surface; section: SurfaceSection } | null {
  const path = ALIASES[pathname] ?? pathname;
  for (const surface of SURFACES) {
    const section = surface.sections.find((s) => s.href === path);
    if (section) return { surface, section };
  }
  return null;
}

/** Which surface a pathname belongs to (surface routes, legacy routes and their sub-paths). */
export function surfaceForPath(pathname: string): SurfaceId | null {
  const clean = pathname.split("?")[0].replace(/\/+$/, "") || "/";
  const direct = SURFACES.find((s) => clean === s.route || clean.startsWith(`${s.route}/`));
  if (direct) return direct.id;
  let best: { id: SurfaceId; len: number } | null = null;
  for (const [from, to] of Object.entries(ALIASES)) {
    if (clean === from || clean.startsWith(`${from}/`)) {
      const hit = locate(to);
      if (hit && (!best || from.length > best.len)) best = { id: hit.surface.id, len: from.length };
    }
  }
  for (const surface of SURFACES) {
    for (const s of surface.sections) {
      if ((clean === s.href || clean.startsWith(`${s.href}/`)) && (!best || s.href.length > best.len)) {
        best = { id: surface.id, len: s.href.length };
      }
    }
  }
  return best?.id ?? null;
}

/** The URL of a surface section. The first section is the surface's bare route. */
/**
 * Whether a URL shows the page `pagePath` (a legacy page route such as "/specs"). Since 0.2 a page
 * is hosted as a section of its surface ("/work?view=specs"), so `pathname === pagePath` is only
 * true for the legacy URL itself. A surface URL without `view` shows its first section.
 */
export function isPageLocation(pagePath: string, pathname: string, search = ""): boolean {
  const clean = pathname.replace(/\/+$/, "") || "/";
  if (clean === pagePath) return true;
  const hit = locate(pagePath);
  if (!hit || clean !== hit.surface.route) return false;
  const view = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("view");
  return (view ?? hit.surface.sections[0]?.id) === hit.section.id;
}

/** The canonical URL of a page route plus a query: "/specs" + "spec=1" -> "/work?view=specs&spec=1". */
export function pageUrl(pagePath: string, query = ""): string {
  const hit = locate(pagePath);
  const base = hit ? sectionUrl(hit.surface, hit.section.id) : pagePath;
  const extra = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
  extra.delete("view");
  const rest = extra.toString();
  if (!rest) return base;
  return `${base}${base.includes("?") ? "&" : "?"}${rest}`;
}

export function sectionUrl(surface: Surface, sectionId: string): string {
  return surface.sections[0]?.id === sectionId ? surface.route : `${surface.route}?view=${sectionId}`;
}
