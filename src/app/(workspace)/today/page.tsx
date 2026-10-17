"use client";

import { TodayView } from "@/components/today/today-view";

/**
 * /today route — the real "what do I do now" view. The dock panel loader
 * dynamic-imports this page module, so classic routing and the dock panel
 * render the exact same component tree.
 */
export default function TodayPage() {
  return <TodayView />;
}
