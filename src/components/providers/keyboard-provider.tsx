"use client";
import * as React from "react";
import { useUi } from "@/lib/stores/ui";
import { useRouter, usePathname } from "next/navigation";
import { findItemByHref, NAV_ITEMS } from "@/lib/nav";

const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

function modKey(e: KeyboardEvent): boolean {
  return isMac ? e.metaKey : e.ctrlKey;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

export function KeyboardProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const setPaletteOpen = useUi((s) => s.setPaletteOpen);
  const setSearchOpen = useUi((s) => s.setSearchOpen);
  const setProjectSwitcherOpen = useUi((s) => s.setProjectSwitcherOpen);
  const setShortcutsOpen = useUi((s) => s.setShortcutsOpen);
  const toggleLeftNav = useUi((s) => s.toggleLeftNav);
  const toggleRightRail = useUi((s) => s.toggleRightRail);
  const toggleStatusBar = useUi((s) => s.toggleStatusBar);

  React.useEffect(() => {
    let pendingG = false;
    let gTimer: number | undefined;

    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const mod = modKey(e);

      if (mod && e.key.toLowerCase() === "k" && !e.shiftKey) {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (mod && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setProjectSwitcherOpen(true);
        return;
      }
      if (mod && e.key === "/") {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (mod && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleLeftNav();
        return;
      }
      if (mod && e.key === ".") {
        e.preventDefault();
        toggleRightRail();
        return;
      }
      if (mod && e.key === "\\") {
        e.preventDefault();
        toggleStatusBar();
        return;
      }
      if (e.key === "?" && !mod) {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }

      if (e.key.toLowerCase() === "g" && !mod) {
        pendingG = true;
        if (gTimer) window.clearTimeout(gTimer);
        gTimer = window.setTimeout(() => {
          pendingG = false;
        }, 900);
        return;
      }

      if (pendingG && !mod) {
        pendingG = false;
        if (gTimer) window.clearTimeout(gTimer);
        const target = NAV_ITEMS.find((i) => i.shortcut?.toLowerCase().endsWith(e.key.toLowerCase()));
        if (target && target.href !== pathname) {
          router.push(target.href);
        }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    router,
    pathname,
    setPaletteOpen,
    setSearchOpen,
    setProjectSwitcherOpen,
    setShortcutsOpen,
    toggleLeftNav,
    toggleRightRail,
    toggleStatusBar,
  ]);

  return <>{children}</>;
}
