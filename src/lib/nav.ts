import {
  LayoutDashboard,
  BrainCircuit,
  PenTool,
  LayoutTemplate,
  Network,
  FileText,
  ShieldCheck,
  Boxes,
  Share2,
  KanbanSquare,
  Flag,
  Bot,
  Workflow,
  MessageSquare,
  BookOpen,
  ScrollText,
  RefreshCw,
  Eye,
  Search,
  Plug,
  Settings,
  Layers,
  Wrench,
  ClipboardList,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Extra terms to match in the command palette. */
  keywords?: string[];
  /** Nested routes (e.g. Brain → Notes/Canvas/Templates/Graph). */
  children?: NavItem[];
}

export interface NavGroup {
  label: string;
  /** Icon shown in the narrow group-rail. */
  icon: LucideIcon;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  // ── Capture: where information is recorded and stored ────────────────────
  {
    label: "Capture",
    icon: BookOpen,
    items: [
      {
        label: "Brain",
        href: "/brain",
        icon: BrainCircuit,
        keywords: ["notes", "ideas"],
        children: [
          { label: "Notes", href: "/brain", icon: PenTool },
          { label: "Canvas", href: "/brain/canvas", icon: LayoutTemplate },
          {
            label: "Templates",
            href: "/brain/templates",
            icon: LayoutTemplate,
          },
          { label: "Graph", href: "/knowledge?categories=note", icon: Network },
        ],
      },
      { label: "Documentation", href: "/docs", icon: BookOpen },
      {
        label: "Files",
        href: "/files",
        icon: Layers,
        keywords: ["attachments", "gallery", "images", "media"],
      },
    ],
  },
  // ── Planning: what to build and the rules it must follow ──────────────────
  {
    label: "Planning",
    icon: ClipboardList,
    items: [
      {
        label: "Specifications",
        href: "/specs",
        icon: FileText,
        keywords: ["rfc", "specs"],
      },
      { label: "Standards", href: "/standards", icon: ShieldCheck },
    ],
  },
  // ── Work: tracking execution and its history ─────────────────────────────
  {
    label: "Work",
    icon: LayoutDashboard,
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      {
        label: "Task Boards",
        href: "/tasks",
        icon: KanbanSquare,
        keywords: ["kanban", "tasks"],
      },
      { label: "Sprints", href: "/sprints", icon: Flag },
      { label: "Dev Logs", href: "/devlogs", icon: ScrollText },
    ],
  },
  // ── Structure: structural and relational maps of the project ─────────────
  {
    label: "Structure",
    icon: Boxes,
    items: [
      { label: "Architecture", href: "/architecture", icon: Boxes },
      {
        label: "Knowledge Graph",
        href: "/knowledge",
        icon: Share2,
        keywords: ["graph", "links"],
      },
    ],
  },
  // ── AI: assisted thinking — conversation, agents, pipeline ───────────────
  {
    label: "AI",
    icon: Bot,
    items: [
      {
        label: "Chat",
        href: "/chat",
        icon: MessageSquare,
        keywords: ["ai", "claude", "openai", "openrouter", "llm", "providers"],
      },
      { label: "AI Agents", href: "/agents", icon: Bot },
      {
        label: "AI Workflow",
        href: "/workflow",
        icon: Workflow,
        keywords: ["16-step", "pipeline"],
      },
    ],
  },
  // ── System: integrations, tools, and configuration ───────────────────────
  {
    label: "System",
    icon: Wrench,
    items: [
      {
        label: "Sync Panel",
        href: "/sync",
        icon: RefreshCw,
        keywords: ["obsidian", "github"],
      },
      {
        label: "Project Watcher",
        href: "/watcher",
        icon: Eye,
        keywords: ["unity", "files", "watch", "changes"],
      },
      {
        label: "Semantic Search",
        href: "/search",
        icon: Search,
      },
      { label: "Plugins", href: "/plugins", icon: Plug },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

/** Flat list of every navigable route, for the command palette. */
export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) =>
  g.items.flatMap((item) => [item, ...(item.children ?? [])]),
);
