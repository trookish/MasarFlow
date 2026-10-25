"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { SURFACES, surfaceForPath } from "@/lib/navigation/surfaces";
import { useUIStore } from "@/lib/stores/ui";
import { cn } from "@/lib/utils/cn";
import { MasarFlowLogo } from "@/components/shell/logo";

/** Standard layout navigation: the six surfaces, with the description as the hover explanation. */
export function SurfaceSidebar() {
  const pathname = usePathname();
  const active = surfaceForPath(pathname);
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggle = useUIStore((s) => s.toggleSidebar);

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-border bg-card/60 transition-[width]",
        collapsed ? "w-14" : "w-52",
      )}
      data-testid="surface-sidebar"
    >
      <div className={cn("flex h-12 items-center gap-2 px-3", collapsed && "justify-center px-0")}>
        <MasarFlowLogo className="size-6 shrink-0" />
        {collapsed ? null : <span className="truncate text-sm font-semibold tracking-tight">MasarFlow</span>}
      </div>
      <nav aria-label="Surfaces" className="flex flex-1 flex-col gap-0.5 px-2 py-2">
        {SURFACES.map((s) => {
          const Icon = s.icon;
          const isActive = active === s.id;
          return (
            <Link
              key={s.id}
              href={s.route}
              aria-label={s.label}
              aria-current={isActive ? "page" : undefined}
              title={collapsed ? `${s.label}: ${s.description}` : s.description}
              className={cn(
                "group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                collapsed && "justify-center px-0",
                isActive
                  ? "bg-accent font-medium text-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              <Icon className={cn("size-4 shrink-0", isActive && "text-primary")} />
              {collapsed ? null : <span className="truncate">{s.label}</span>}
            </Link>
          );
        })}
      </nav>
      <button
        type="button"
        onClick={toggle}
        className="m-2 flex items-center justify-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        {collapsed ? null : <span>Collapse</span>}
      </button>
    </aside>
  );
}
