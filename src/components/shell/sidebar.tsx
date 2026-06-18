"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeft, Workflow } from "lucide-react";
import { NAV_GROUPS, type NavItem } from "@/lib/nav";
import { useUIStore } from "@/lib/stores/ui";
import { useMounted } from "@/lib/hooks/use-mounted";
import { cn } from "@/lib/utils/cn";
import { Tooltip } from "@/components/ui/tooltip";

function isActive(pathname: string, href: string, exact = false): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

function NavLink({
  item,
  collapsed,
  pathname,
  nested = false,
}: {
  item: NavItem;
  collapsed: boolean;
  pathname: string;
  nested?: boolean;
}) {
  const Icon = item.icon;
  const active = isActive(pathname, item.href, nested);
  const link = (
    <Link
      href={item.href}
      className={cn(
        "group flex items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors",
        collapsed ? "h-9 w-9 justify-center" : "h-9",
        nested && !collapsed && "ml-3 pl-3",
        active
          ? "bg-accent font-medium text-foreground"
          : "text-sidebar-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0",
          active ? "text-primary" : "text-muted-foreground",
        )}
      />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
  return collapsed ? (
    <Tooltip label={item.label} side="right">
      {link}
    </Tooltip>
  ) : (
    link
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const mounted = useMounted();
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  // Avoid hydration mismatch: server + first client render are expanded.
  const collapsed = mounted && sidebarCollapsed;

  return (
    <aside
      className={cn(
        "flex h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <div
        className={cn(
          "flex h-14 items-center border-b border-sidebar-border px-3",
          collapsed ? "justify-center" : "justify-between",
        )}
      >
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Workflow className="h-4 w-4" />
            </span>
            <span className="text-sm font-semibold tracking-tight">
              MasarFlow
            </span>
          </Link>
        )}
        <button
          type="button"
          aria-label="Toggle sidebar"
          onClick={toggleSidebar}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
      </div>

      <nav className="scrollbar-thin flex-1 space-y-4 overflow-y-auto px-2 py-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="space-y-1">
            {!collapsed && (
              <p className="px-2.5 pb-1 text-[10px] font-semibold tracking-wider text-muted-foreground/70 uppercase">
                {group.label}
              </p>
            )}
            {group.items.map((item) => {
              const showChildren =
                !collapsed && item.children && isActive(pathname, item.href);
              return (
                <div key={item.href} className="space-y-1">
                  <NavLink
                    item={item}
                    collapsed={collapsed}
                    pathname={pathname}
                  />
                  {showChildren
                    ? item.children!.map((child) => (
                        <NavLink
                          key={child.href}
                          item={child}
                          collapsed={collapsed}
                          pathname={pathname}
                          nested
                        />
                      ))
                    : null}
                </div>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
