"use client";
import * as React from "react";
import { Trash2, RotateCcw, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/lib/db/schema";
import { useVault } from "@/lib/stores/vault";
import { formatRelativeTime } from "@/lib/utils";
import { toast } from "sonner";

export function TrashView() {
  const runSync = useVault((s) => s.runSync);
  const settings = useVault((s) => s.settings);
  const status = useVault((s) => s.status);
  const trashFiles = useLiveQuery(() => getDb().syncFiles.where("status").equals("trash").toArray(), [], []);
  const deletedRemote = useLiveQuery(() => getDb().syncFiles.where("status").equals("deleted-remote").toArray(), [], []);
  const deletedLocal = useLiveQuery(() => getDb().syncFiles.where("status").equals("deleted-local").toArray(), [], []);
  const hardDelete = async (id: string) => {
    await getDb().syncFiles.delete(id);
    toast.success("Removed from trash view");
  };
  const hardDeleteAll = async () => {
    const all = [...(trashFiles ?? []), ...(deletedRemote ?? []), ...(deletedLocal ?? [])];
    if (!window.confirm("Empty trash view? " + all.length + " entries. Vault files are not touched.")) return;
    for (const f of all) await getDb().syncFiles.delete(f.id);
    toast.success("Trash view cleared");
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <div className="text-sm font-medium flex items-center gap-2"><Trash2 className="h-4 w-4" />Trash</div>
          <div className="text-[11px] text-muted-foreground">Notes deleted on either side. Restore or discard.</div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="soft" onClick={() => runSync()} disabled={status === "syncing"}>Sync now</Button>
          <Button size="sm" variant="outline" onClick={hardDeleteAll}>Empty</Button>
        </div>
      </div>
      <Group title="From Obsidian" count={trashFiles?.length ?? 0} hint="Files in vault .trash/ — restore moves them back to their original path.">
        {trashFiles?.map((f) => (
          <Row key={f.id} path={f.relativePath} sub="Vault trash" when={f.lastSyncedAt} onDelete={() => hardDelete(f.id)} />
        ))}
      </Group>
      <Group title="From MasarFlow" count={(deletedLocal?.length ?? 0) + (deletedRemote?.length ?? 0)} hint="Notes deleted in the app. Hard delete removes the record; vault files stay put.">
        {deletedLocal?.map((f) => <Row key={f.id} path={f.relativePath} sub="Deleted locally" when={f.lastSyncedAt} onDelete={() => hardDelete(f.id)} />)}
        {deletedRemote?.map((f) => <Row key={f.id} path={f.relativePath} sub="Deleted in vault" when={f.lastSyncedAt} onDelete={() => hardDelete(f.id)} />)}
      </Group>
      {!settings.trashIncluded && (
        <div className="flex items-center gap-2 rounded-md border border-[color:var(--warning)]/30 bg-[color:var(--warning)]/10 p-2 text-[11px] text-[color:var(--warning)]">
          <AlertCircle className="h-3 w-3" />Vault .trash/ is excluded. Enable in Settings to see vault deletions here.
        </div>
      )}
    </div>
  );
}

function Group({ title, count, hint, children }: { title: string; count: number; hint: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">{title}<Badge variant="ghost" className="text-[10px]">{count}</Badge></CardTitle>
        <CardDescription>{hint}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1.5">{children}</CardContent>
    </Card>
  );
}

function Row({ path, sub, when, onDelete }: { path: string; sub: string; when: number; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/60 bg-card/40 p-2 text-[11px]">
      <div className="min-w-0 flex-1 truncate">{path}</div>
      <Badge variant="ghost" className="text-[10px]">{sub}</Badge>
      <span className="text-[10px] text-muted-foreground">{formatRelativeTime(when)}</span>
      <Button size="icon-sm" variant="ghost" onClick={onDelete} title="Discard record"><X className="h-3 w-3" /></Button>
    </div>
  );
}
