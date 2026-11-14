"use client";

import { useEffect, useState } from "react";

/**
 * A counter that increments when the document's theme changes (class, style or data-theme on the
 * root element). Canvas and exported drawings use it to re-resolve CSS variable colours.
 */
export function useThemeVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setVersion((v) => v + 1));
    observer.observe(root, { attributes: true, attributeFilter: ["class", "style", "data-theme", "data-accent"] });
    return () => observer.disconnect();
  }, []);
  return version;
}
