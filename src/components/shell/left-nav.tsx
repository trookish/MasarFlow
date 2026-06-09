"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronsLeft,
  ChevronsRight,
  Compass,
  type LucideIcon,
} from "lucide-react";
import { useUi } from "@/lib/stores/ui";
import { NAV_ITEMS, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const GROUPS: Array<{ id: NavItem["group"]; label: string }> = [
  { id: "workspace", label: "Workspace" },
  { id: "intelligence", label: "Intelligence" },
  { id: "system", label: "System" },
];

function NavItemLink({
  item,
  collapsed,
}: {
  item: NavItem;
  collapsed: boolean;
}) {
  const pathname = usePathname();
  const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
  const Icon = item.icon;

  const inner = (
    <Link
      href={item.href}
      className={cn(
        "group relative flex items-center gap-3 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
        isActive
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
        collapsed && "justify-center px-0",
      )}
    >
      {isActive && (
        <motion.span
          layoutId="nav-active-pill"
          className="absolute inset-0 rounded-md bg-accent"
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
        />
      )}
      <Icon className="relative z-10 h-4 w-4 shrink-0" />
      {!collapsed && (
        <span className="relative z-10 truncate">{item.label}</span>
      )}
      {!collapsed && item.shortcut && (
        <span className="relative z-10 ml-auto text-[10px] font-mono text-muted-foreground/70">
          {item.shortcut}
        </span>
      )}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip delayDuration={150}>
        <TooltipTrigger asChild>{inner}</TooltipTrigger>
        <TooltipContent side="right">
          <div className="flex flex-col">
            <span className="font-medium">{item.label}</span>
            {item.shortcut && (
              <span className="text-[10px] text-muted-foreground">{item.shortcut}</span>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }
  return inner;
}

export function LeftNav() {
  const collapsed = useUi((s) => s.leftNavCollapsed);
  const toggle = useUi((s) => s.toggleLeftNav);

  return (
    <TooltipProvider>
      <motion.aside
        initial={false}
        animate={{ width: collapsed ? 56 : 240 }}
        transition={{ type: "spring", stiffness: 320, damping: 32 }}
        className="relative z-30 flex h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
      >
        <div className={cn("flex h-12 items-center border-b border-sidebar-border px-3", collapsed && "justify-center px-0")}>
          <Link
            href="/"
            className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm font-semibold tracking-tight"
            aria-label="MasarFlow home"
          >
            <span className="grid h-6 w-6 place-items-center rounded-md bg-foreground text-background">
              <Compass className="h-3.5 w-3.5" />
            </span>
            {!collapsed && <span>MasarFlow</span>}
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {GROUPS.map((g) => {
            const items = NAV_ITEMS.filter((i) => i.group === g.id);
            return (
              <div key={g.id} className="mb-3">
                <AnimatePresence initial={false}>
                  {!collapsed && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70"
                    >
                      {g.label}
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="space-y-0.5">
                  {items.map((item) => (
                    <NavItemLink key={item.id} item={item} collapsed={collapsed} />
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-2">
          <button
            onClick={toggle}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground",
              collapsed && "justify-center px-0",
            )}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronsRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronsLeft className="h-4 w-4" />
                <span>Collapse</span>
                <span className="ml-auto font-mono text-[10px]">⌘B</span>
              </>
            )}
          </button>
        </div>
      </motion.aside>
    </TooltipProvider>
  );
}
