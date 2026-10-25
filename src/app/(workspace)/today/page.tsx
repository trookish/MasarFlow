"use client";

import { TodayView } from "@/components/today/today-view";
import { SurfaceView } from "@/components/shell/surface-view";
import { useUIStore } from "@/lib/stores/ui";

/**
 * /today is the Today surface in the standard layout and the plain view in a Studio dock panel
 * (the dock dynamic-imports this module, so both layouts share one component tree).
 */
export default function TodayPage() {
  const studio = useUIStore((s) => s.layoutMode === "studio");
  return studio ? <TodayView /> : <SurfaceView id="today" />;
}
