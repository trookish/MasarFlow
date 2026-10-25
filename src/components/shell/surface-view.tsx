"use client";

import { Suspense, type ComponentType } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PAGE_COMPONENTS } from "@/components/dock/panel-loader";
import { TodayView } from "@/components/today/today-view";
import { getSurface, sectionUrl, type SurfaceId } from "@/lib/navigation/surfaces";
import { useProjectStore } from "@/lib/stores/project";
import { cn } from "@/lib/utils/cn";

// "/today" is both a section and the Today surface's own page: render the view itself, never the
// page module (it would render this surface again).
const DIRECT: Record<string, ComponentType> = { "/today": TodayView };

function SurfaceBody({ id }: { id: SurfaceId }) {
  const surface = getSurface(id)!;
  const view = useSearchParams().get("view");
  const section = surface.sections.find((s) => s.id === view) ?? surface.sections[0];
  const Page = DIRECT[section.href] ?? PAGE_COMPONENTS[section.href];
  const activeProjectId = useProjectStore((s) => s.activeProjectId);

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      data-surface={surface.id}
      data-section={section.id}
      data-testid={activeProjectId ? "shell-ready" : undefined}
    >
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-background/80 px-4 py-2 backdrop-blur">
        <div className="min-w-0">
          <h1 className="text-sm font-semibold leading-tight">{surface.label}</h1>
          <p className="truncate text-xs text-muted-foreground">{surface.description}</p>
        </div>
        {surface.sections.length > 1 ? (
          <nav aria-label={`${surface.label} sections`} className="ml-auto flex flex-wrap gap-1" role="tablist">
            {surface.sections.map((s) => {
              const active = s.id === section.id;
              return (
                <Link
                  key={s.id}
                  href={sectionUrl(surface, s.id)}
                  role="tab"
                  aria-selected={active}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs transition-colors",
                    active
                      ? "bg-accent font-medium text-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  )}
                >
                  {s.label}
                </Link>
              );
            })}
          </nav>
        ) : null}
      </header>
      <div className="relative min-h-0 flex-1 overflow-auto" data-surface-section={section.href} key={section.href}>
        {Page ? <Page /> : <p className="p-6 text-sm text-muted-foreground">This section is not available.</p>}
      </div>
    </div>
  );
}

/** A surface page in the standard layout: a header, its section tabs and the hosted page. */
export function SurfaceView({ id }: { id: SurfaceId }) {
  return (
    <Suspense fallback={null}>
      <SurfaceBody id={id} />
    </Suspense>
  );
}
