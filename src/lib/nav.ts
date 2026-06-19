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
  BookOpen,
  ScrollText,
  RefreshCw,
  Eye,
  Search,
  Plug,
  Settings,
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
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
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
      {
        label: "Specifications",
        href: "/specs",
        icon: FileText,
        keywords: ["rfc", "specs"],
      },
      { label: "Standards", href: "/standards", icon: ShieldCheck },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { label: "Architecture", href: "/architecture", icon: Boxes },
      {
        label: "Knowledge Graph",
        href: "/knowledge",
        icon: Share2,
        keywords: ["graph", "links"],
      },
      {
        label: "Task Boards",
        href: "/tasks",
        icon: KanbanSquare,
        keywords: ["kanban", "tasks"],
      },
      { label: "Sprints", href: "/sprints", icon: Flag },
      { label: "AI Agents", href: "/agents", icon: Bot },
      {
        label: "AI Workflow",
        href: "/workflow",
        icon: Workflow,
        keywords: ["16-step", "pipeline"],
      },
    ],
  },
  {
    label: "System",
    items: [
      { label: "Documentation", href: "/docs", icon: BookOpen },
      { label: "Dev Logs", href: "/devlogs", icon: ScrollText },
      {
        label: "Sync Panel",
        href: "/sync",
        icon: RefreshCw,
        keywords: ["obsidian", "github"],
      },
      { label: "Unity Watcher", href: "/watcher", icon: Eye },
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
