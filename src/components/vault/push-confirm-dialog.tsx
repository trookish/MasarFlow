"use client";
import * as React from "react";
import { Download, FileArchive, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useVault } from "@/lib/stores/vault";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/lib/db/schema";

export function PushConfirmDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const runPush = useVault((s) => s.runPush);
  const vaultName = useVault((s) => s.vaultName);
  const projectId = useLiveQuery(async () => (await getDb().projects.toArray())[0]?.id, [], undefined);
  const pending = useLiveQuery(
    async () => {
      if (!projectId) return [];
      return await getDb().syncFiles.where({ projectId }).filter((f) => f.status === "local-newer").toArray();
    },
    [projectId],
    [],
  );
  const count = pending?.length ?? 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">Push to vault</DialogTitle>
          <DialogDescription>
            {count} file{count === 1 ? "" : "s"} have local changes. Your browser doesn't support in-place writes; choose how to save.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Button
            className="w-full justify-start gap-2"
            variant="soft"
            disabled={count === 0}
            onClick={async () => {
              await runPush();
              onOpenChange(false);
            }}
          >
            <FileArchive className="h-4 w-4" />Download {vaultName || "vault"}-{new Date().toISOString().slice(0, 10)}.zip
            <Badge variant="ghost" className="ml-auto text-[10px]">recommended</Badge>
          </Button>
          <div className="rounded-md border border-border bg-surface-2 p-2 text-[10px] text-muted-foreground">
            Per-file downloads will trigger {count} save dialogs.
          </div>
        </div>
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
