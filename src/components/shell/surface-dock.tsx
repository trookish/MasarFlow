"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useUIStore } from "@/lib/stores/ui";
import { MasarFlowLogo } from "@/components/shell/logo";
import {
  NavIconChip,
  SurfaceNavLink,
} from "@/components/shell/surface-nav-item";
import { useSurfaceLinks } from "@/components/shell/surface-sidebar";
import { Tooltip } from "@/components/ui/tooltip";

function Divider() {
  return <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-border" />;
}

/**
 * Bottom navigation: a floating dock of the six surfaces under the content.
 * Collapsing folds it down to one small button that brings it back; the
 * folded state is remembered.
 */
export function SurfaceDock() {
  const collapsed = useUIStore((s) => s.dockCollapsed);
  const setCollapsed = useUIStore((s) => s.setDockCollapsed);
  const links = useSurfaceLinks();

  if (collapsed) {
    return (
      <div
        className="relative z-30 flex shrink-0 justify-center pb-2 pt-1"
        data-testid="surface-dock"
        data-collapsed="true"
      >
        <Tooltip label="Expand dock (Ctrl+B)" side="top">
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            aria-label="Expand dock"
            className="grid size-9 place-items-center rounded-full border border-border bg-card/80 text-muted-foreground shadow-sm outline-none backdrop-blur transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronUp className="size-4" />
          </button>
        </Tooltip>
      </div>
    );
  }

  return (
    <div
      className="relative z-30 flex shrink-0 justify-center px-4 pb-3 pt-2"
      data-testid="surface-dock"
      data-collapsed="false"
    >
      <div className="flex items-center gap-1 rounded-2xl border border-border bg-card/80 p-1.5 shadow-lg backdrop-blur">
        <span className="grid size-9 shrink-0 place-items-center">
          <MasarFlowLogo className="size-7" />
        </span>
        <Divider />
        <nav aria-label="Surfaces" className="flex items-center gap-1">
          {links.map(({ surface: s, href, active }) => (
            <Tooltip
              key={s.id}
              label={`${s.label}: ${s.description}`}
              side="top"
            >
              <SurfaceNavLink
                href={href}
                label={s.label}
                icon={s.icon}
                active={active}
                showLabel={false}
              />
            </Tooltip>
          ))}
        </nav>
        <Divider />
        <Tooltip label="Collapse dock (Ctrl+B)" side="top">
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            aria-label="Collapse dock"
            className="group rounded-lg text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <NavIconChip icon={ChevronDown} active={false} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
