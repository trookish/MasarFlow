"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, ArrowDown, ArrowUp, FolderOpen, FileText, Search } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { VaultPicker } from "@/components/vault/vault-picker";
import { VaultModeBadge } from "@/components/vault/vault-mode-badge";
import { SyncRow } from "@/components/vault/sync-row";
import { TrashView } from "@/components/vault/trash-view";
import { useVault } from "@/lib/stores/vault";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb, type SyncFile } from "@/lib/db/schema";
import { formatRelativeTime } from "@/lib/utils";

export default function SyncPage() {
  const router = useRouter();
  const settings = useVault((s) => s.settings);
  const status = useVault((s) => s.status);
  const lastResult = useVault((s) => s.lastResult);
  const lastFullSync = useVault((s) => s.lastFullSync);
  const lastError = useVault((s) => s.lastError);
  const progress = useVault((s) => s.progress);
  const runSync = useVault((s) => s.runSync);
  const runPull = useVault((s) => s.runPull);
  const runPush = useVault((s) => s.runPush);
  const projectId = useLiveQuery(async () => (await getDb().projects.toArray())[0]?.id, [], undefined);
  const allFiles = useLiveQuery<SyncFile[]>(async () => projectId ? await getDb().syncFiles.where({ projectId }).toArray() : [], [projectId]) ?? [];
  const [tab, setTab] = React.useState<"all" | "conflicts" | "trash" | "templates">("all");
  const [q, setQ] = React.useState("");

  const filtered = React.useMemo(() => {
    let arr = (allFiles ?? ([] as SyncFile[])).filter((f: SyncFile) => !f.inTrash);
    if (tab === "conflicts") arr = arr.filter((f: SyncFile) => f.status === "conflict" || f.status === "local-newer" || f.status === "remote-newer");
    if (tab === "templates") arr = arr.filter((f: SyncFile) => f.isTemplate);
    if (q) { const k = q.toLowerCase(); arr = arr.filter((f: SyncFile) => f.relativePath.toLowerCase().includes(k)); }
    return arr.sort((a: SyncFile, b: SyncFile) => b.mtime - a.mtime);
  }, [allFiles, tab, q]);

  const counts = React.useMemo(() => {
    const c = { all: 0, conflicts: 0, templates: 0 };
    for (const f of allFiles ?? []) {
      if (f.inTrash) continue;
      c.all++;
      if (f.status === "conflict" || f.status === "local-newer" || f.status === "remote-newer") c.conflicts++;
      if (f.isTemplate) c.templates++;
    }
    return c;
  }, [allFiles]);

  return (
    <div className="pb-10">
      <PageHeader icon={RefreshCw} eyebrow="Vault" title="Sync manager" description="Obsidian vault sync - pull, push, and resolve conflicts." actions={<VaultModeBadge />} />
      <div className="space-y-4 px-6 py-5">
        <div className="grid gap-3 lg:grid-cols-3">
          <VaultPicker />
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Sync status</CardTitle>
              <CardDescription>Last full sync {lastFullSync ? formatRelativeTime(lastFullSync) : "never"}.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {progress && <div className="text-[11px] text-muted-foreground">Reading {progress.current}/{progress.total}: {progress.file}</div>}
              {lastResult && <div className="grid grid-cols-2 gap-2 text-[11px]"><Stat label="Scanned" value={lastResult.scanned} /><Stat label="Created" value={lastResult.created} /><Stat label="Updated" value={lastResult.updated} /><Stat label="Attachments" value={lastResult.attachments} /></div>}
              {lastError && <div className="border border-destructive/30 bg-destructive/10 p-2 text-[11px] text-destructive rounded-md">{lastError}</div>}
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" onClick={() => runSync()} disabled={status === "syncing" || settings.mode !== "obsidian"} className="gap-1.5"><RefreshCw className={"h-3 w-3 " + (status === "syncing" ? "animate-spin" : "")} />Sync</Button>
                <Button size="sm" variant="soft" onClick={() => runPull()} disabled={status === "syncing" || settings.mode !== "obsidian"} className="gap-1.5"><ArrowDown className="h-3 w-3" />Pull</Button>
                <Button size="sm" variant="soft" onClick={() => runPush()} disabled={status === "syncing" || settings.mode !== "obsidian"} className="gap-1.5"><ArrowUp className="h-3 w-3" />Push</Button>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">What syncs</CardTitle>
              <CardDescription>Numbered PARA folders, plus trash and templates.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1.5 text-[11px]">
              {settings.includePatterns.map((p) => <div key={p} className="flex items-center gap-1.5"><FolderOpen className="h-3 w-3" />{p}</div>)}
              <div className="mt-1 text-[10px] text-muted-foreground">Excluded: {settings.excludePatterns.join(", ")}</div>
            </CardContent>
          </Card>
        </div>
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="all">All <Badge variant="ghost" className="ml-1 text-[10px]">{counts.all}</Badge></TabsTrigger>
            <TabsTrigger value="conflicts">Conflicts <Badge variant="ghost" className="ml-1 text-[10px]">{counts.conflicts}</Badge></TabsTrigger>
            <TabsTrigger value="templates">Templates <Badge variant="ghost" className="ml-1 text-[10px]">{counts.templates}</Badge></TabsTrigger>
            <TabsTrigger value="trash">Trash</TabsTrigger>
          </TabsList>
          <TabsContent value="all" className="space-y-2">
            <div className="relative"><Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by path..." className="pl-8" /></div>
            <ScrollArea className="h-[60vh]"><div className="space-y-1.5 pr-2">
              {filtered.length === 0 && <Empty />}
              {filtered.map((f) => <SyncRow key={f.id} file={f} onAction={(a) => { if (a === "push") runPush(); else if (a === "pull") runPull(); }} onOpen={f.noteId ? () => router.push("/brain/" + f.noteId) : undefined} />)}
            </div></ScrollArea>
          </TabsContent>
          <TabsContent value="conflicts"><ScrollArea className="h-[60vh]"><div className="space-y-1.5 pr-2">{filtered.length === 0 ? <Empty /> : filtered.map((f) => <SyncRow key={f.id} file={f} onAction={() => undefined} />)}</div></ScrollArea></TabsContent>
          <TabsContent value="templates"><ScrollArea className="h-[60vh]"><div className="space-y-1.5 pr-2">{filtered.length === 0 ? <Empty /> : filtered.map((f) => <SyncRow key={f.id} file={f} onAction={() => undefined} />)}</div></ScrollArea></TabsContent>
          <TabsContent value="trash"><TrashView /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-md border border-border bg-surface-2 px-2 py-1"><div className="text-[10px] text-muted-foreground">{label}</div><div className="text-sm font-medium tabular-nums">{value}</div></div>;
}

function Empty() {
  return <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground"><FileText className="mx-auto mb-2 h-5 w-5" />Nothing to show. Connect a vault or run a sync.</div>;
}
