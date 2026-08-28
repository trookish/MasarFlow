"use client";

/**
 * Keep-alive panel host: mounts the page component once and toggles it with
 * display:none when it is not the active tab. Panel state (drafts, scroll,
 * streams) survives tab switches because the component never unmounts.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export function PanelContent({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  return (
    <div
      aria-hidden={!active}
      className={cn("h-full w-full", !active && "pointer-events-none")}
      style={active ? undefined : { display: "none" }}
    >
      {children}
    </div>
  );
}
