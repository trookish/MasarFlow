"use client";

/**
 * Keeps the dock's terminal panel in step with the main process across a page
 * reload: sessions survive in the main process (ring buffer + pty), so the
 * panel re-attaches to them instead of pretending they are gone.
 *
 * Nothing here starts a process — only the user does, from the panel.
 */

import { useEffect } from "react";
import { getDesktop } from "@/lib/desktop/bridge";

export function useTerminalSync(): void {
  useEffect(() => {
    const desktop = getDesktop();
    if (!desktop) return;
    // Touch the list once so the main process's session table is warm and any
    // crashed shell is reported as exited rather than silently missing.
    void desktop.terminal.list();
  }, []);
}
