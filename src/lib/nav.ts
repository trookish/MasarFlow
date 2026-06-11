import { LayoutDashboard, Brain, FileText, ShieldCheck, Network, Share2, ListTodo, Bot, Workflow, BookOpen, ScrollText, Search, Settings, type LucideIcon } from "lucide-react";

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  shortcut?: string;
  description: string;
  group: "workspace" | "intelligence" | "system";
}

export const NAV_ITEMS: NavItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
    shortcut: "G D",
    description: "Project health, active work, recent activity",
    group: "workspace",
  },
  {
    id: "brain",
    label: "Brain",
    href: "/brain",
    icon: Brain,
    shortcut: "G B",
    description: "Notes, ideas, research, decisions",
    group: "workspace",
  },
  {
    id: "specs",
    label: "Specifications",
    href: "/specs",
    icon: FileText,
    shortcut: "G S",
    description: "RFC-style feature specs",
    group: "workspace",
  },
  {
    id: "standards",
    label: "Standards",
    href: "/standards",
    icon: ShieldCheck,
    description: "Personal coding philosophy",
    group: "workspace",
  },
  {
    id: "architecture",
    label: "Architecture",
    href: "/architecture",
    icon: Network,
    shortcut: "G A",
    description: "Systems, dependencies, flows",
    group: "intelligence",
  },
  {
    id: "graph",
    label: "Knowledge Graph",
    href: "/knowledge-graph",
    icon: Share2,
    shortcut: "G K",
    description: "Cross-module relationship view",
    group: "intelligence",
  },
  {
    id: "tasks",
    label: "Tasks",
    href: "/tasks",
    icon: ListTodo,
    shortcut: "G T",
    description: "Work, dependencies, progress",
    group: "intelligence",
  },
  { id: "agents", label: "AI Agents", href: "/agents", icon: Bot, description: "Specialized collaborators", group: "intelligence" },
  { id: "workflow", label: "AI Workflow", href: "/workflow", icon: Workflow, description: "16-step pipeline", group: "intelligence" },
  {
    id: "docs",
    label: "Documentation",
    href: "/docs",
    icon: BookOpen,
    description: "Auto-maintained project docs",
    group: "system",
  },
  {
    id: "dev-logs",
    label: "Dev Logs",
    href: "/dev-logs",
    icon: ScrollText,
    shortcut: "G L",
    description: "Chronological project memory",
    group: "system",
  },
  {
    id: "search",
    label: "Search",
    href: "/search",
    icon: Search,
    description: "Semantic search across everything",
    group: "system",
  },
  {
    id: "settings",
    label: "Settings",
    href: "/settings",
    icon: Settings,
    description: "Theme, keybindings, integrations",
    group: "system",
  },
];

export function findItemByHref(href: string): NavItem | undefined {
  return NAV_ITEMS.find((i) => i.href === href);
}
