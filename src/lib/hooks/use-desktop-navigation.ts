"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getDesktop } from "@/lib/desktop/bridge";
import { PAGE_PATHS } from "@/lib/dock/registry";

/**
 * P10.T11: the tray's "Control Center" item sends `app:navigate` from the main
 * process. Only routes the app actually ships are honoured — the main process
 * never gets to push the shell to a page outside the nav registry.
 */
export function useDesktopNavigation(): void {
  const router = useRouter();
  useEffect(() => {
    const d = getDesktop();
    if (!d) return;
    return d.app.onNavigate((route) => {
      if (PAGE_PATHS.includes(route)) router.push(route);
    });
  }, [router]);
}
