"use client";
import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUi } from "@/lib/stores/ui";
import { NAV_ITEMS } from "@/lib/nav";
import { Keyboard } from "lucide-react";

const SHORTCUTS: Array<{ keys: string; label: string; group: string }> = [
  { group: "Global", keys: "⌘ K / Ctrl K", label: "Open command palette" },
  { group: "Global", keys: "⌘ P / Ctrl P", label: "Switch project" },
  { group: "Global", keys: "⌘ / / Ctrl /", label: "Global search" },
  { group: "Global", keys: "⌘ B / Ctrl B", label: "Toggle left nav" },
  { group: "Global", keys: "⌘ . / Ctrl .", label: "Toggle right rail" },
  { group: "Global", keys: "⌘ \\ / Ctrl \\", label: "Toggle status bar" },
  { group: "Global", keys: "?", label: "Open this cheatsheet" },
  { group: "Go to", keys: "G D", label: "Dashboard" },
  { group: "Go to", keys: "G B", label: "Brain" },
  { group: "Go to", keys: "G S", label: "Specifications" },
  { group: "Go to", keys: "G T", label: "Tasks" },
  { group: "Go to", keys: "G A", label: "Architecture" },
  { group: "Go to", keys: "G K", label: "Knowledge Graph" },
  { group: "Go to", keys: "G L", label: "Dev Logs" },
];

export function ShortcutsCheatsheet() {
  const open = useUi((s) => s.shortcutsCheatsheetOpen);
  const setOpen = useUi((s) => s.setShortcutsOpen);

  const grouped = React.useMemo(() => {
    const g: Record<string, typeof SHORTCUTS> = {};
    SHORTCUTS.forEach((s) => {
      g[s.group] ??= [];
      g[s.group].push(s);
    });
    return g;
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-4 w-4" /> Keyboard shortcuts
          </DialogTitle>
          <DialogDescription>Move at the speed of thought.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {group}
              </h3>
              <ul className="space-y-1.5">
                {items.map((s) => (
                  <li key={s.keys + s.label} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{s.label}</span>
                    <kbd className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px]">
                      {s.keys}
                    </kbd>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-3 border-t border-border pt-3 text-[11px] text-muted-foreground">
          {NAV_ITEMS.filter((i) => i.shortcut).length} modules are reachable via the
          <kbd className="mx-1 rounded border border-border bg-surface-2 px-1 font-mono">G</kbd>
          prefix.
        </div>
      </DialogContent>
    </Dialog>
  );
}
