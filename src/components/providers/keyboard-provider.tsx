"use client";
import * as React from "react";
import { useUi } from "@/lib/stores/ui";
import { useRouter, usePathname } from "next/navigation";
import { getEffectiveShortcuts, type ShortcutDef } from "@/lib/keyboard/shortcuts";
import { resetSeed } from "@/lib/db/seed";
import { emitAutomationEvent } from "@/lib/automation/engine";
import { useAi } from "@/lib/stores/ai";
import { useActiveProject } from "@/lib/db/repos/projects";
import { useVault } from "@/lib/stores/vault";
import { setOpenNewNote, setOpenNewSpec, setOpenNewTask, setOpenNewLog, setOpenNewDoc, setOpenNewStandard, useCreateDialogs } from "@/lib/stores/create-dialogs";

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

function normalizeEventKey(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.metaKey) parts.push("Cmd");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  const k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  if (!["Control", "Meta", "Alt", "Shift"].includes(k)) parts.push(k);
  return parts.join("+");
}

function keyToCombo(e: KeyboardEvent): string {
  return normalizeEventKey(e);
}

function tokenizeCombo(combo: string): string[] {
  return combo
    .split("+")
    .map((s) => s.trim())
    .filter(Boolean);
}

function comboToCanonical(combo: string): string {
  const tokens = tokenizeCombo(combo);
  const hasCtrl = tokens.some((t) => t.toLowerCase() === "ctrl" || t.toLowerCase() === "cmd");
  const hasShift = tokens.some((t) => t.toLowerCase() === "shift");
  const hasAlt = tokens.some((t) => t.toLowerCase() === "alt");
  const key = tokens.find((t) => !["ctrl", "cmd", "shift", "alt"].includes(t.toLowerCase()));
  if (!key) return "";
  const parts: string[] = [];
  if (hasCtrl) parts.push(isMac ? "Cmd" : "Ctrl");
  if (hasShift) parts.push("Shift");
  if (hasAlt) parts.push("Alt");
  parts.push(key.length === 1 ? key.toUpperCase() : key);
  return parts.join("+");
}

function buildMatcher(def: ShortcutDef): (parts: string[]) => boolean {
  const tokens = tokenizeCombo(comboToCanonical(def.keys));
  return (pressed) => {
    if (pressed.length !== tokens.length) return false;
    return tokens.every((t, i) => t.toLowerCase() === pressed[i].toLowerCase());
  };
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
  const cycleProvider = useAi((s) => s.cycleProvider);
  const activeProject = useActiveProject();
  const projectId = activeProject?.id;
  useCreateDialogs();

  React.useEffect(() => {
    let sequence: string[] = [];
    let seqTimer: number | undefined;
    const resetSeq = () => {
      sequence = [];
      if (seqTimer) window.clearTimeout(seqTimer);
    };

    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      const token = keyToCombo(e);
      if (token.includes("Ctrl") || token.includes("Cmd") || token.includes("Alt")) {
        const shortcuts = getEffectiveShortcuts();
        for (const s of shortcuts) {
          const tokens = tokenizeCombo(comboToCanonical(s.keys));
          if (tokens.length === 1 && buildMatcher(s)([token])) {
            handleAction(s.id);
            e.preventDefault();
            return;
          }
        }
        return;
      }

      sequence.push(token);
      if (seqTimer) window.clearTimeout(seqTimer);
      seqTimer = window.setTimeout(resetSeq, 900);

      if (sequence.length > 2) {
        resetSeq();
        return;
      }

      const shortcuts = getEffectiveShortcuts();
      for (const s of shortcuts) {
        const tokens = tokenizeCombo(comboToCanonical(s.keys));
        if (tokens.length === sequence.length && buildMatcher(s)(sequence)) {
          handleAction(s.id);
          e.preventDefault();
          resetSeq();
          return;
        }
      }
    };

    const handleAction = (id: string) => {
      switch (id) {
        case "palette":
          setPaletteOpen(true);
          return;
        case "search":
          setSearchOpen(true);
          return;
        case "project":
          setProjectSwitcherOpen(true);
          return;
        case "leftnav":
          toggleLeftNav();
          return;
        case "rightrail":
          toggleRightRail();
          return;
        case "statusbar":
          toggleStatusBar();
          return;
        case "cheatsheet":
          setShortcutsOpen(true);
          return;
        case "save":
          window.dispatchEvent(new CustomEvent("masarflow:request-save"));
          return;
        case "cycle-ai":
          cycleProvider();
          return;
        case "reset-seed":
          if (projectId) {
            resetSeed().then(() => {
              emitAutomationEvent({ id: "seed-reset-" + Date.now(), kind: "seed-reset", message: "Local seed reset", at: Date.now() });
            });
          }
          return;
        case "run-workflow":
          window.dispatchEvent(new CustomEvent("masarflow:run-workflow"));
          return;
        case "sync-now":
          void useVault.getState().runSync();
          return;
        case "review-plans":
          router.push("/specs?filter=awaiting-approval");
          return;
      }

      const routeById: Record<string, string> = {
        "go-dashboard": "/",
        "go-brain": "/brain",
        "go-specs": "/specs",
        "go-tasks": "/tasks",
        "go-architecture": "/architecture",
        "go-graph": "/knowledge-graph",
        "go-logs": "/dev-logs",
        "go-workflow": "/workflow",
        "go-sync": "/sync",
      };
      if (routeById[id]) {
        if (pathname !== routeById[id]) router.push(routeById[id]);
        return;
      }

      const newById: Record<string, () => void> = {
        "new-note": () => setOpenNewNote(true),
        "new-spec": () => setOpenNewSpec(true),
        "new-task": () => setOpenNewTask(true),
        "new-log": () => setOpenNewLog(true),
        "new-doc": () => setOpenNewDoc(true),
        "new-standard": () => setOpenNewStandard(true),
      };
      if (newById[id]) newById[id]();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    router,
    pathname,
    projectId,
    setPaletteOpen,
    setSearchOpen,
    setProjectSwitcherOpen,
    setShortcutsOpen,
    toggleLeftNav,
    toggleRightRail,
    toggleStatusBar,
    cycleProvider,
  ]);

  return <>{children}</>;
}
