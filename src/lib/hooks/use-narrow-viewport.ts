"use client";

/**
 * The current viewport mode, updated on resize. Reads window.innerWidth (the
 * browser's real width, not a container), which is what the layout decisions
 * in T23 depend on.
 */

import { useEffect, useState } from "react";
import { viewportMode, type ViewportMode } from "@/lib/ui/viewport";

export function useViewportMode(): ViewportMode {
  const [mode, setMode] = useState<ViewportMode>(() =>
    typeof window === "undefined" ? "regular" : viewportMode(window.innerWidth),
  );

  useEffect(() => {
    const update = (): void => setMode(viewportMode(window.innerWidth));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return mode;
}
