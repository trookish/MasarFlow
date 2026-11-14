"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useUi } from "@/lib/stores/ui";

export function useShortcutsHandler() {
  const router = useRouter();
  const ui = useUi();
  const lastKeyRef = React.useRef<{ key: string; time: number } | null>(null);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).isContentEditable
      ) {
        return;
      }

      const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
      const mod = isMac ? e.metaKey : e.ctrlKey;
      
      const keyUpper = e.key.toUpperCase();
      
      // Handle sequences (e.g., G D for Go Dashboard)
      const now = Date.now();
      if (lastKeyRef.current && now - lastKeyRef.current.time < 1000) {
        const sequence = `${lastKeyRef.current.key} ${keyUpper}`;
        
        switch (sequence) {
          case "G D": router.push("/"); e.preventDefault(); break;
          case "G B": router.push("/brain"); e.preventDefault(); break;
          case "G S": router.push("/specs"); e.preventDefault(); break;
          case "G T": router.push("/tasks"); e.preventDefault(); break;
          case "G A": router.push("/architecture"); e.preventDefault(); break;
          case "G K": router.push("/knowledge-graph"); e.preventDefault(); break;
          case "G L": router.push("/dev-logs"); e.preventDefault(); break;
          case "G W": router.push("/workflow"); e.preventDefault(); break;
          case "G P": router.push("/plugins"); e.preventDefault(); break;
          case "G ,": router.push("/settings"); e.preventDefault(); break;
        }
        
        lastKeyRef.current = null;
        return;
      }
      
      // Record key for sequence if it's G or N
      if (keyUpper === "G" || keyUpper === "N" || keyUpper === "R" || keyUpper === "S") {
        lastKeyRef.current = { key: keyUpper, time: now };
      }

      // Single-stroke with Mod
      if (mod) {
        if (e.key === "k" || e.key === "K") {
          e.preventDefault();
          ui.setPaletteOpen(!ui.paletteOpen);
        }
        if (e.key === "/") {
          e.preventDefault();
          ui.setSearchOpen(!ui.searchOpen);
        }
        if (e.key === "p" || e.key === "P") {
          e.preventDefault();
          ui.setProjectSwitcherOpen(!ui.projectSwitcherOpen);
        }
        if (e.key === "b" || e.key === "B") {
          e.preventDefault();
          ui.toggleLeftNav();
        }
        if (e.key === ".") {
          e.preventDefault();
          ui.toggleRightRail();
        }
      } else {
        if (e.key === "?") {
          e.preventDefault();
          ui.setShortcutsOpen(!ui.shortcutsCheatsheetOpen);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router, ui]);
}
