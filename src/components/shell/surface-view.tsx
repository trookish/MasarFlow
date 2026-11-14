"use client";

import { Suspense, type ComponentType } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PAGE_COMPONENTS } from "@/components/dock/panel-loader";
import { TodayView } from "@/components/today/today-view";
import { getSurface, type SurfaceId } from "@/lib/navigation/surfaces";
import { usePageSettings } from "@/lib/stores/page-settings";
import { cn } from "@/lib/utils/cn";

// "/today" is both a section and the Today surface's own page: render the view itself, never the
// page module (it would render this surface again).
const DIRECT: Record<string, ComponentType> = { "/today": TodayView };

function SurfaceBody({ id }: { id: SurfaceId }) {
  const surface = getSurface(id)!;
  const view = useSearchParams().get("view");
  const captureDefault = usePageSettings((s) => s.brain.defaultView);
  const preferredView = id === "capture" && !view ? captureDefault : view;
  const section = surface.sections.find((s) => s.id === preferredView) ?? surface.sections[0];
  const Page = DIRECT[section.href] ?? PAGE_COMPONENTS[section.href];

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      data-surface={surface.id}
      data-section={section.id}
    >
      {/* The tab strip already names the surface, so the header carries only the section switcher; the
          surface title stays for assistive tech and the description moves to a tooltip. */}
      <header
        className="flex shrink-0 items-center gap-2 border-b border-border bg-background/80 px-3 py-1 backdrop-blur"
        title={surface.description}
      >
        <h1 className="sr-only">{surface.label}</h1>
        {surface.sections.length > 1 ? (
          <nav aria-label={`${surface.label} sections`} className="flex min-w-0 flex-wrap gap-1" role="tablist">
            {surface.sections.map((s) => {
              const active = s.id === section.id;
              return (
                <Link
                  key={s.id}
                  // Always an explicit view: a bare route keeps the tab's query
                  // snapshot, so the first section's link would reopen the last one.
                  href={`${surface.route}?view=${s.id}`}
                  role="tab"
                  aria-selected={active}
                  className={cn(
                    "relative rounded-md px-2.5 py-1 text-xs transition-colors",
                    active
                      ? "bg-accent font-medium text-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  )}
                >
                  {s.label}
                  {active ? (
                    <span aria-hidden className="pointer-events-none absolute inset-x-2.5 bottom-0 h-0.5 rounded-full bg-primary" />
                  ) : null}
                </Link>
              );
            })}
          </nav>
        ) : (
          <span className="py-1 text-xs text-muted-foreground">{surface.description}</span>
        )}
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
