"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { resolveLegacyUrl } from "@/lib/navigation/redirects";
import { SURFACES } from "@/lib/navigation/surfaces";
import type { LayoutMode } from "@/lib/stores/ui";

/**
 * Keeps the URL in the active layout's vocabulary. Standard: a v0.2 route (bookmark, deep link,
 * old command) is replaced by its surface URL with the query kept. Studio: a surface URL opens the
 * section's original page, which the dock knows how to host.
 */
export function LayoutRouter({ mode }: { mode: LayoutMode }) {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    const search = window.location.search;
    if (mode === "standard") {
      const dest = resolveLegacyUrl(pathname, search);
      if (dest) router.replace(dest);
      return;
    }
    const surface = SURFACES.find((s) => s.route === pathname && s.route !== s.sections[0]?.href);
    if (!surface) return;
    const params = new URLSearchParams(search);
    const section = surface.sections.find((x) => x.id === params.get("view")) ?? surface.sections[0];
    params.delete("view");
    const rest = params.toString();
    router.replace(rest ? `${section.href}?${rest}` : section.href);
  }, [mode, pathname, router]);
  return null;
}
