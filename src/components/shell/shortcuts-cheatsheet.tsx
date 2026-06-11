"use client";
import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Keyboard, Search, AlertTriangle, RotateCcw, Sparkles, X } from "lucide-react";
import { useUi } from "@/lib/stores/ui";
import { getEffectiveShortcuts, setShortcutOverride, clearShortcutOverride, findConflicts, type ShortcutDef } from "@/lib/keyboard/shortcuts";
import { cn } from "@/lib/utils";

export function ShortcutsCheatsheet() {
  const open = useUi((s) => s.shortcutsCheatsheetOpen);
  const setOpen = useUi((s) => s.setShortcutsOpen);
  const [query, setQuery] = React.useState("");
  const [version, setVersion] = React.useState(0);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draftKey, setDraftKey] = React.useState("");

  const shortcuts = React.useMemo(() => getEffectiveShortcuts(), [version, open]);
  const conflicts = React.useMemo(() => findConflicts(shortcuts), [shortcuts]);
  const conflictKeys = new Set(Array.from(conflicts.keys()));

  const groups = React.useMemo(() => {
    const filtered = shortcuts.filter((s) =>
      !query ||
      s.label.toLowerCase().includes(query.toLowerCase()) ||
      s.description.toLowerCase().includes(query.toLowerCase()) ||
      s.keys.toLowerCase().includes(query.toLowerCase()),
    );
    const m: Record<string, ShortcutDef[]> = {};
    for (const s of filtered) {
      (m[s.group] ??= []).push(s);
    }
    return m;
  }, [shortcuts, query]);

  const startEdit = (s: ShortcutDef) => {
    setEditingId(s.id);
    setDraftKey(s.keys);
  };

  const commitEdit = (id: string) => {
    if (!draftKey.trim()) return;
    setShortcutOverride(id, draftKey.trim());
    setEditingId(null);
    setVersion((v) => v + 1);
  };

  const reset = (id: string) => {
    clearShortcutOverride(id);
    setEditingId(null);
    setVersion((v) => v + 1);
  };

  const conflictCount = Array.from(conflicts.values()).reduce((a, b) => a + b.length, 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Keyboard className="h-4 w-4" />Keyboard shortcuts</DialogTitle>
          <DialogDescription>All shortcuts. Click any key combination to remap. Conflicts are highlighted.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search shortcuts..." className="pl-8" autoFocus />
        </div>
        {conflictCount > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-[color:var(--warning)]/30 bg-[color:var(--warning)]/10 p-2.5 text-[11px] text-[color:var(--warning)]">
            <AlertTriangle className="h-3.5 w-3.5" />{conflictCount} shortcut{conflictCount === 1 ? "" : "s"} in conflict (sharing a key combination).
          </div>
        )}
        <div className="max-h-[60vh] space-y-4 overflow-y-auto">
          {Object.entries(groups).map(([group, items]) => (
            <div key={group}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group}</h3>
              <ul className="space-y-1">
                {items.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 rounded-md border border-border/50 bg-card/60 px-3 py-2 text-sm">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{s.label}</div>
                      <div className="text-[10px] text-muted-foreground text-pretty">{s.description}</div>
                    </div>
                    {editingId === s.id ? (
                      <div className="flex items-center gap-1.5">
                        <Input value={draftKey} onChange={(e) => setDraftKey(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") commitEdit(s.id); if (e.key === "Escape") setEditingId(null); }} autoFocus className="h-7 w-32 text-[10px] font-mono" />
                        <Button size="sm" variant="soft" onClick={() => commitEdit(s.id)} className="h-7 text-[10px]">Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} className="h-7 text-[10px]">Cancel</Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className={cn("rounded border border-border bg-surface-2 px-2 py-0.5 font-mono text-[10px]", conflictKeys.has(s.keys.toLowerCase().trim()) && "border-[color:var(--warning)]/50 bg-[color:var(--warning)]/10 text-[color:var(--warning)]")}>
                          {s.keys}
                        </span>
                        <Button size="icon-sm" variant="ghost" onClick={() => startEdit(s)} aria-label={"Remap " + s.label}>
                          <Keyboard className="h-3 w-3" />
                        </Button>
                        <Button size="icon-sm" variant="ghost" onClick={() => reset(s.id)} aria-label={"Reset " + s.label}>
                          <RotateCcw className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-border pt-3 text-[11px] text-muted-foreground">
          <div className="inline-flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-[color:var(--primary)]" />Remaps are local to this browser.
          </div>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
