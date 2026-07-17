"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

/** A single nav link in the expanded panel. */
function NavLink({
  item,
  pathname,
  nested = false,
}: {
  item: NavItem;
  pathname: string;
  nested?: boolean;
}) {
  const Icon = item.icon;
  const active = isActive(pathname, item.href, nested);
  return (
    <Link
      href={item.href}
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

/** A clickable group icon in the narrow left rail. */
function GroupRailButton({
  group,
  active,
  onClick,
  anyChildActive,
}: {
  group: NavGroup;
  active: boolean;
  onClick: () => void;
  anyChildActive: boolean;
}) {
  const Icon = group.icon;
  return (
    <Tooltip label={group.label} side="right">
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
};

export function Sidebar() {
  const pathname = usePathname();
  const mounted = useMounted();
  const activeNavGroup = useUIStore((s) => s.activeNavGroup);
  const setActiveNavGroup = useUIStore((s) => s.setActiveNavGroup);
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const brainDefaultView = usePageSettings((s) => s.brain.defaultView);

  const brainHref = BRAIN_DEFAULT_HREF[brainDefaultView] ?? "/brain";

  // Avoid hydration mismatch: server + first client render use the first
  // group. A stale persisted group label (e.g. after a rename) resolves to
  // the first group via the fallback below, so the rail stays consistent.
  const openGroup = mounted ? activeNavGroup : NAV_GROUPS[0].label;

  // Detect which group owns the current pathname (for dot indicators).
  const activeGroup = NAV_GROUPS.find((g) =>
    g.items.some((item) => isActive(pathname, item.href)),
  );

  const currentGroup = NAV_GROUPS.find((g) => g.label === openGroup) ?? NAV_GROUPS[0];

  return (
    <aside
      aria-hidden={sidebarCollapsed}
      className={cn(
        "flex h-screen shrink-0 border-r border-sidebar-border bg-sidebar transition-all duration-200 ease-in-out",
        sidebarCollapsed
          ? "pointer-events-none -ml-[252px] opacity-0"
          : "ml-0 opacity-100",
      )}
    >
      {/* ── Left icon rail ────────────────────────────────────────────── */}
      <div className="flex w-[60px] shrink-0 flex-col items-center gap-1 border-r border-sidebar-border/60 py-3">
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
        <nav className="scrollbar-thin flex-1 space-y-1 overflow-y-auto px-2 py-2">
          {currentGroup.items.map((item) => {
            const showChildren = item.children && isActive(pathname, item.href);
            const navItem =
              item.href === "/brain" ? { ...item, href: brainHref } : item;
            return (
              <div key={item.href} className="space-y-0.5">
                <NavLink item={navItem} pathname={pathname} />
                {showChildren
                  ? item.children!.map((child) => (
                      <NavLink
                        key={child.href}
                        item={child}
                        pathname={pathname}
                        nested
                      />
                    ))
                  : null}
              </div>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
