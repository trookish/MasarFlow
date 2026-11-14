"use client";

import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";
import { SURFACES, surfaceForPath } from "@/lib/navigation/surfaces";
import { useDockStore } from "@/lib/stores/dock";
import { useUIStore } from "@/lib/stores/ui";
import { cn } from "@/lib/utils/cn";
import { MasarFlowLogo } from "@/components/shell/logo";
import { NavIconChip, SurfaceNavLink } from "@/components/shell/surface-nav-item";

/**
 * Each surface tab keeps a query snapshot (its section, its selection). The
 * link carries it, so the shell's URL sync has nothing to mirror: a mirror
 * replace issued after this navigation would supersede a click made right
 * after it and drop the user's next navigation.
 */
export function useSurfaceLinks() {
  const pathname = usePathname();
  const active = surfaceForPath(pathname);
  const snapshots = useDockStore((s) => {
    const st = s.activeProjectId ? s.projects[s.activeProjectId] : null;
    return st?.workspaces[st.activeWorkspace]?.params;
  });
  return SURFACES.map((s) => {
    const snapshot = snapshots?.[s.route];
    return { surface: s, href: snapshot ? `${s.route}?${snapshot}` : s.route, active: active === s.id };
  });
}

/**
 * The surface rail on the left or right edge. Every icon and the logo sit at a
 * fixed size and position; expanding only reveals the labels beside them.
 */
export function SurfaceSidebar({ side = "left" }: { side?: "left" | "right" }) {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggle = useUIStore((s) => s.toggleNavigation);
  const links = useSurfaceLinks();
  const CollapseIcon =
    side === "left"
      ? collapsed
        ? PanelLeftOpen
        : PanelLeftClose
      : collapsed
        ? PanelRightOpen
        : PanelRightClose;

  return (
    <aside
      className={cn(
        "relative z-20 flex h-full shrink-0 flex-col overflow-hidden bg-card/60 transition-[width] duration-200 ease-out",
        side === "left" ? "border-r border-border" : "border-l border-border",
        collapsed ? "w-[60px]" : "w-56",
      )}
      data-testid="surface-sidebar"
      data-side={side}
    >
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
        <MasarFlowLogo className="size-7 shrink-0" />
        {collapsed ? null : (
          <span className="truncate whitespace-nowrap text-sm font-semibold tracking-tight">MasarFlow</span>
        )}
      </div>
      <nav aria-label="Surfaces" className="flex flex-1 flex-col gap-1 px-3 py-3">
        {links.map(({ surface: s, href, active }) => (
          <SurfaceNavLink
            key={s.id}
            href={href}
            label={s.label}
            title={collapsed ? `${s.label}: ${s.description}` : s.description}
            icon={s.icon}
            active={active}
            showLabel={!collapsed}
            className={collapsed ? undefined : "pr-3 hover:bg-accent/40"}
          />
        ))}
      </nav>
      <button
        type="button"
        onClick={toggle}
        className={cn(
          "group mx-3 mb-3 flex items-center gap-3 rounded-lg text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
          !collapsed && "pr-3 hover:bg-accent/40",
        )}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed ? "Expand sidebar (Ctrl+B)" : "Collapse sidebar (Ctrl+B)"}
      >
        <NavIconChip icon={CollapseIcon} active={false} />
        {collapsed ? null : <span className="whitespace-nowrap">Collapse</span>}
      </button>
    </aside>
  );
}
