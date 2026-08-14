"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";
import { NAV_GROUPS, type NavItem, type NavGroup } from "@/lib/nav";
import { MasarFlowLogo } from "./logo";
import { useUIStore } from "@/lib/stores/ui";
import { usePageSettings } from "@/lib/stores/page-settings";
import { useMounted } from "@/lib/hooks/use-mounted";
import { Tooltip } from "@/components/ui/tooltip";

function isActive(pathname: string, href: string, exact = false): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

/** A single nav link in the expanded panel or the dock popup. */
function NavLink({
  item,
  pathname,
  nested = false,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  nested?: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const active = isActive(pathname, item.href, nested);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "group flex items-center gap-2.5 rounded-md px-2.5 text-sm transition-all duration-150",
        "h-9",
        nested && "ml-3 pl-3",
        active
          ? "bg-accent font-medium text-foreground"
          : "text-sidebar-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 transition-colors",
          active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
        )}
      />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

/** A clickable group icon in the narrow rail (left/right modes). */
function GroupRailButton({
  group,
  active,
  onClick,
  anyChildActive,
  tooltipSide,
}: {
  group: NavGroup;
  active: boolean;
  onClick: () => void;
  anyChildActive: boolean;
  tooltipSide: "left" | "right";
}) {
  const Icon = group.icon;
  return (
    <Tooltip label={group.label} side={tooltipSide}>
      <button
        type="button"
        onClick={onClick}
        aria-label={group.label}
        className={cn(
          "relative flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-150",
          active
            ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
            : anyChildActive
              ? "bg-accent/70 text-foreground"
              : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
        )}
      >
        <Icon className="h-[18px] w-[18px]" />
        {/* Active-group indicator dot */}
        {anyChildActive && !active && (
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
        )}
      </button>
    </Tooltip>
  );
}

const BRAIN_DEFAULT_HREF: Record<string, string> = {
  notes: "/brain",
  canvas: "/brain/canvas",
  templates: "/brain/templates",
  graph: "/brain/graph",
};

/** Item rows for one group — shared by the rails and the dock popup. */
function GroupItems({
  group,
  pathname,
  brainHref,
  onNavigate,
}: {
  group: NavGroup;
  pathname: string;
  brainHref: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="space-y-1">
      {group.items.map((item) => {
        const showChildren = item.children && isActive(pathname, item.href);
        const navItem =
          item.href === "/brain" ? { ...item, href: brainHref } : item;
        return (
          <div key={item.href} className="space-y-0.5">
            <NavLink item={navItem} pathname={pathname} onNavigate={onNavigate} />
            {showChildren
              ? item.children!.map((child) => (
                  <NavLink
                    key={child.href}
                    item={child}
                    pathname={pathname}
                    nested
                    onNavigate={onNavigate}
                  />
                ))
              : null}
          </div>
        );
      })}
    </nav>
  );
}

/** Floating panel that pops up above the dock for the open group. */
function DockPopup({
  group,
  pathname,
  brainHref,
  onClose,
}: {
  group: NavGroup;
  pathname: string;
  brainHref: string;
  onClose: () => void;
}) {
  // Mount → next frame: the enter transition (translate/scale/opacity) runs.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      role="menu"
      className={cn(
        "absolute bottom-[calc(100%+0.75rem)] left-1/2 w-64 -translate-x-1/2 origin-bottom",
        "rounded-[var(--radius-lg)] border border-sidebar-border bg-sidebar/95 p-1.5",
        "shadow-2xl shadow-black/30 backdrop-blur-md",
        "transition-all duration-150 ease-out",
        shown
          ? "translate-y-0 scale-100 opacity-100"
          : "translate-y-1 scale-95 opacity-0",
      )}
    >
      <div className="px-2.5 pt-1.5 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
        {group.label}
      </div>
      <div className="scrollbar-thin max-h-[60vh] overflow-y-auto pb-1">
        <GroupItems
          group={group}
          pathname={pathname}
          brainHref={brainHref}
          onNavigate={onClose}
        />
      </div>
    </div>
  );
}

/** Seelen-style floating dock: click a group to pop its pages up above it. */
function FloatingDock({
  pathname,
  activeGroup,
  brainHref,
  onCollapse,
}: {
  pathname: string;
  activeGroup: NavGroup | undefined;
  brainHref: string;
  onCollapse: () => void;
}) {
  const [openGroupLabel, setOpenGroupLabel] = useState<string | null>(null);
  const dockRef = useRef<HTMLElement>(null);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!openGroupLabel) return;
    function onPointer(e: MouseEvent) {
      if (dockRef.current && !dockRef.current.contains(e.target as Node)) {
        setOpenGroupLabel(null);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenGroupLabel(null);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [openGroupLabel]);

  // Close after navigating (e.g. via the command palette). Render-phase state
  // adjustment, mirroring the "derived state" pattern used elsewhere.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setOpenGroupLabel(null);
  }

  const openGroup =
    NAV_GROUPS.find((g) => g.label === openGroupLabel) ?? null;

  return (
    <aside
      ref={dockRef}
      aria-label="Navigation dock"
      className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2"
    >
      {openGroup && (
        <DockPopup
          group={openGroup}
          pathname={pathname}
          brainHref={brainHref}
          onClose={() => setOpenGroupLabel(null)}
        />
      )}
      <nav className="flex items-center gap-1 rounded-lg border border-sidebar-border bg-sidebar/85 p-1.5 shadow-lg shadow-black/25 backdrop-blur-md">
        <Tooltip label="Dashboard" side="top">
          <Link
            href="/dashboard"
            className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-accent/60"
            aria-label="MasarFlow home"
          >
            <MasarFlowLogo className="h-6 w-6" />
          </Link>
        </Tooltip>
        <div className="mx-0.5 h-6 w-px bg-sidebar-border" aria-hidden />
        {NAV_GROUPS.map((group) => {
          const Icon = group.icon;
          const open = openGroup?.label === group.label;
          const childActive = activeGroup?.label === group.label;
          return (
            <Tooltip key={group.label} label={group.label} side="top">
              <button
                type="button"
                aria-label={group.label}
                aria-expanded={open}
                onClick={() => setOpenGroupLabel(open ? null : group.label)}
                className={cn(
                  "relative flex h-10 w-10 items-center justify-center rounded-full transition-all duration-150",
                  open
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                    : childActive
                      ? "bg-accent/70 text-foreground"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                <Icon className="h-[18px] w-[18px]" />
                {/* Active-group indicator dot */}
                {childActive && !open && (
                  <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary" />
                )}
              </button>
            </Tooltip>
          );
        })}
        <div className="mx-0.5 h-6 w-px bg-sidebar-border" aria-hidden />
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Hide navigation dock"
          title="Hide dock (⌘B)"
          className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </nav>
    </aside>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const mounted = useMounted();
  const activeNavGroup = useUIStore((s) => s.activeNavGroup);
  const setActiveNavGroup = useUIStore((s) => s.setActiveNavGroup);
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const taskbarDirection = useUIStore((s) => s.taskbarDirection);
  const brainDefaultView = usePageSettings((s) => s.brain.defaultView);

  const brainHref = BRAIN_DEFAULT_HREF[brainDefaultView] ?? "/brain";

  // Avoid hydration mismatch: server + first client render use the defaults
  // (first group, left rail); persisted values apply once mounted.
  const direction = mounted ? taskbarDirection : "left";
  const openGroup = mounted ? activeNavGroup : NAV_GROUPS[0].label;

  // Detect which group owns the current pathname (for dot indicators).
  const activeGroup = NAV_GROUPS.find((g) =>
    g.items.some((item) => isActive(pathname, item.href)),
  );

  const currentGroup = NAV_GROUPS.find((g) => g.label === openGroup) ?? NAV_GROUPS[0];
  const isRight = direction === "right";

  if (direction === "bottom") {
    if (sidebarCollapsed) {
      return (
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="Expand navigation dock"
          title="Expand navigation dock (⌘B)"
          className="fixed bottom-4 left-1/2 z-40 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full border border-sidebar-border bg-sidebar/85 text-muted-foreground shadow-lg shadow-black/25 backdrop-blur-md transition-all duration-200 hover:bg-accent/60 hover:text-foreground"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
      );
    }
    return (
      <FloatingDock
        pathname={pathname}
        activeGroup={activeGroup}
        brainHref={brainHref}
        onCollapse={toggleSidebar}
      />
    );
  }

  // Right rail collapsed: floating expand handle on the right edge.
  if (isRight && sidebarCollapsed) {
    return (
      <button
        type="button"
        onClick={toggleSidebar}
        aria-label="Expand sidebar"
        title="Expand sidebar (⌘B)"
        className="fixed right-0 top-1/2 z-40 flex h-20 w-6 -translate-y-1/2 items-center justify-center rounded-l-lg border border-r-0 border-sidebar-border bg-sidebar/85 text-muted-foreground shadow-lg backdrop-blur-md transition-colors hover:bg-accent/60 hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
    );
  }

  return (
    <aside
      aria-hidden={sidebarCollapsed}
      className={cn(
        "flex h-screen shrink-0 bg-sidebar transition-all duration-200 ease-in-out",
        isRight ? "border-l border-sidebar-border" : "border-r border-sidebar-border",
        isRight && "flex-row-reverse",
        sidebarCollapsed
          ? cn(
              "pointer-events-none opacity-0",
              isRight ? "-mr-[252px]" : "-ml-[252px]",
            )
          : cn("opacity-100", isRight ? "mr-0" : "ml-0"),
      )}
    >
      {/* ── Icon rail ─────────────────────────────────────────────────── */}
      <div
        className={cn(
          "flex w-[60px] shrink-0 flex-col items-center gap-1 py-3",
          isRight
            ? "border-l border-sidebar-border/60"
            : "border-r border-sidebar-border/60",
        )}
      >
        {/* Logo */}
        <Link
          href="/dashboard"
          className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl transition-colors hover:bg-accent/60"
          aria-label="MasarFlow home"
        >
          <MasarFlowLogo className="h-7 w-7" />
        </Link>

        {/* Group buttons */}
        <nav className="flex flex-col items-center gap-1.5" aria-label="Navigation groups">
          {NAV_GROUPS.map((group) => (
            <GroupRailButton
              key={group.label}
              group={group}
              active={currentGroup.label === group.label}
              anyChildActive={activeGroup?.label === group.label}
              onClick={() => setActiveNavGroup(group.label)}
              tooltipSide={isRight ? "left" : "right"}
            />
          ))}
        </nav>
      </div>

      {/* ── Expanded items panel ──────────────────────────────────────── */}
      <div className="flex w-48 shrink-0 flex-col overflow-hidden">
        {/* Panel header */}
        <div className="flex h-14 shrink-0 items-center border-b border-sidebar-border px-4">
          <span className="text-xs font-semibold tracking-wider text-muted-foreground/70 uppercase">
            {currentGroup.label}
          </span>
        </div>

        {/* Items */}
        <div className="scrollbar-thin flex-1 overflow-y-auto px-2 py-2">
          <GroupItems group={currentGroup} pathname={pathname} brainHref={brainHref} />
        </div>
      </div>
    </aside>
  );
}
