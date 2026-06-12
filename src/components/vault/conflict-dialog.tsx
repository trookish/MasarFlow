"use client";
import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useVault } from "@/lib/stores/vault";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb, type SyncFile } from "@/lib/db/schema";
import { brainNoteToVault } from "@/lib/vault/markdown-adapter";
import { brainTaskToVault as t2v } from "@/lib/vault/tasks-adapter";

export function ConflictDialog({ open, onOpenChange, file, onResolved }: { open: boolean; onOpenChange: (v: boolean) => void; file: SyncFile | null; onResolved?: () => void }) {
  const localNoteQ = useLiveQuery(async () => file?.noteId ? await getDb().notes.get(file.noteId) : undefined, [file?.noteId]);
  const localTaskQ = useLiveQuery(async () => file?.taskId ? await getDb().tasks.get(file.taskId) : undefined, [file?.taskId]);
  const localNote = localNoteQ ?? null;
  const localTask = localTaskQ ?? null;
  if (!file) return null;
  const localBody = localNote ? brainNoteToVault(localNote) : localTask ? t2v(localTask) : "";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">Conflict · {file.relativePath}</DialogTitle>
          <DialogDescription>Choose which version to keep. "Both" creates a sibling copy.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground"><Badge variant="ghost">Local</Badge>last modified here</div>
            <ScrollArea className="h-64 rounded-md border border-border bg-surface-2 p-2">
              <pre className="whitespace-pre-wrap text-[10px] font-mono">{localBody || "(empty)"}</pre>
            </ScrollArea>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground"><Badge variant="ghost">Remote</Badge>in vault</div>
            <ScrollArea className="h-64 rounded-md border border-border bg-surface-2 p-2">
              <pre className="whitespace-pre-wrap text-[10px] font-mono">{"(vault file body — read on sync)"}</pre>
            </ScrollArea>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="soft" onClick={() => { void useVault.getState().runSync(); onResolved?.(); onOpenChange(false); }}>Keep newer</Button>
          <Button onClick={() => { void useVault.getState().runPush(); onResolved?.(); onOpenChange(false); }}>Keep local</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
