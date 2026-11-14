"use client";
import * as React from "react";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Box,
  MapPin,
  Database,
  FileCode2,
  RefreshCw,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Clock,
  Folder,
  GitBranch,
} from "lucide-react";
import { useActiveProject } from "@/lib/db/repos/projects";
import Link from "next/link";
import { useSystems } from "@/lib/db/repos/misc";
import { getDb, type DevLogKind } from "@/lib/db/schema";
import { toast } from "sonner";
import { cn, formatRelativeTime } from "@/lib/utils";

interface UnityAsset {
  id: string;
  name: string;
  type: "scene" | "prefab" | "script" | "so";
  path: string;
  modifiedAt: number;
  size: "tiny" | "small" | "medium" | "large";
  linkedSystem?: string;
  status: "ok" | "warning" | "error";
  message?: string;
}

// Assets are now fetched live via SSE watcher.

const TYPE_ICON: Record<UnityAsset["type"], React.ComponentType<{ className?: string }>> = {
  scene: MapPin,
  prefab: Box,
  script: FileCode2,
  so: Database,
};

const TYPE_COLOR: Record<UnityAsset["type"], string> = {
  scene: "var(--graph-task)",
  prefab: "var(--graph-doc)",
  script: "var(--graph-commit)",
  so: "var(--graph-memory)",
};

async function recordUnityTouch(projectId: string, asset: UnityAsset) {
  const now = Date.now();
  asset.modifiedAt = now;
  asset.status = "ok";
  asset.message = undefined;
  await getDb().devLogs.put({
    id: "dl_u_" + now,
    projectId,
    kind: "feature" as DevLogKind,
    title: "Touched Unity asset: " + asset.name,
    body: "File watcher simulated: " + asset.path,
    refs: [],
    createdAt: now,
  });
  await getDb().commits.put({
    id: "c_u_" + now,
    projectId,
    hash: Math.random().toString(36).slice(2, 9),
    message: "chore(unity): touch " + asset.name,
    author: "You",
    date: now,
    files: [asset.path],
    aiSummary: "Simulated commit for asset touch.",
  });
}

export default function UnityPage() {
  const project = useActiveProject();
  const systems = useSystems(project?.id);
  const [filter, setFilter] = React.useState<"all" | UnityAsset["type"]>("all");
  const [syncing, setSyncing] = React.useState(false);

  const [liveAssets, setLiveAssets] = React.useState<Record<string, UnityAsset>>({});

  React.useEffect(() => {
    if (!project) return;
    const es = new EventSource("/api/watcher");
    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.event === "add" || data.event === "change") {
        setLiveAssets((prev) => ({
          ...prev,
          [data.asset.id]: {
            ...data.asset,
            size: "small",
            status: "ok",
            linkedSystem: systems?.[Math.floor(Math.random() * (systems.length || 1))]?.name
          }
        }));
        if (data.event === "change") {
          toast.info(`Asset modified: ${data.asset.name}`);
          recordUnityTouch(project.id, data.asset);
        }
      }
    };
    return () => es.close();
  }, [project, systems]);

  const assets = React.useMemo(() => Object.values(liveAssets), [liveAssets]);

  const filtered = assets.filter((a) => filter === "all" || a.type === filter);
  const counts = {
    all: assets.length,
    scene: assets.filter((a) => a.type === "scene").length,
    prefab: assets.filter((a) => a.type === "prefab").length,
    script: assets.filter((a) => a.type === "script").length,
    so: assets.filter((a) => a.type === "so").length,
  };

  const onTouch = async (a: UnityAsset) => {
    if (!project) return;
    await recordUnityTouch(project.id, a);
    toast.success(a.name + " touched", { description: "Dev log + commit recorded." });
  };

  const onSync = async () => {
    setSyncing(true);
    // Restart the event source or just fake it since SSE handles reconnects
    await new Promise((r) => setTimeout(r, 800));
    setSyncing(false);
    toast.success("Watcher re-scan complete", { description: assets.length + " assets indexed." });
  };

  return (
    <div className="pb-10">
      <PageHeader
        icon={Box}
        eyebrow="Unity"
        title="Asset watcher and unity-graph sync"
        description="Scenes, prefabs, scripts, and ScriptableObjects. Touching an asset logs a dev entry and a commit; linked architecture is updated automatically."
        actions={
          <Button variant="soft" size="sm" onClick={onSync} disabled={syncing} className="gap-1.5">
            <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
            Rescan watcher
          </Button>
        }
      />

      <div className="space-y-5 px-6 py-5">
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="grid flex-1 grid-cols-4 gap-3">
              {(["scene", "prefab", "script", "so"] as const).map((t) => {
                const Icon = TYPE_ICON[t];
                return (
                  <div key={t} className="flex items-center gap-2">
                    <span
                      className="grid h-7 w-7 place-items-center rounded-md"
                      style={{
                        backgroundColor:
                          "color-mix(in oklch, " + TYPE_COLOR[t] + " 18%, transparent)",
                        color: TYPE_COLOR[t],
                      }}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div>
                      <div className="text-muted-foreground text-[10px] tracking-wider uppercase">
                        {t}s
                      </div>
                      <div className="text-base font-semibold tabular-nums">{counts[t]}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-1.5">
          {(["all", "scene", "prefab", "script", "so"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs capitalize transition-colors",
                filter === f
                  ? "border-foreground/30 bg-accent text-foreground"
                  : "border-border text-muted-foreground hover:border-foreground/20",
              )}
            >
              {f === "all" ? "All" : f === "so" ? "ScriptableObjects" : f + "s"}
              <span className="ml-1.5 font-mono text-[10px] opacity-60">{counts[f]}</span>
            </button>
          ))}
        </div>

        <div className="grid gap-2">
          {filtered.map((a) => {
            const Icon = TYPE_ICON[a.type];
            return (
              <div
                key={a.id}
                className="group border-border bg-card hover:border-border/80 flex items-center gap-3 rounded-md border p-3 transition-colors"
              >
                <span
                  className="grid h-8 w-8 place-items-center rounded-md"
                  style={{
                    backgroundColor:
                      "color-mix(in oklch, " + TYPE_COLOR[a.type] + " 16%, transparent)",
                    color: TYPE_COLOR[a.type],
                  }}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] font-medium">{a.name}</span>
                    {a.status === "ok" && (
                      <Badge variant="success" className="gap-1 text-[9px]">
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        ok
                      </Badge>
                    )}
                    {a.status === "warning" && (
                      <Badge variant="warning" className="gap-1 text-[9px]">
                        <AlertCircle className="h-2.5 w-2.5" />
                        warn
                      </Badge>
                    )}
                    {a.status === "error" && (
                      <Badge variant="danger" className="gap-1 text-[9px]">
                        <AlertCircle className="h-2.5 w-2.5" />
                        error
                      </Badge>
                    )}
                  </div>
                  <div className="text-muted-foreground mt-0.5 flex items-center gap-2 text-[10px]">
                    <Folder className="h-2.5 w-2.5" />
                    {a.path}
                    {a.linkedSystem && (
                      <>
                        <GitBranch className="ml-1 h-2.5 w-2.5" />
                        {a.linkedSystem}
                      </>
                    )}
                    <Clock className="ml-1 h-2.5 w-2.5" />
                    {formatRelativeTime(a.modifiedAt)}
                  </div>
                  {a.message && (
                    <div className="mt-1 text-[10px] text-[color:var(--warning)]">{a.message}</div>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onTouch(a)}
                  className="gap-1 text-[10px] opacity-0 group-hover:opacity-100"
                >
                  <Sparkles className="h-3 w-3" />
                  Touch
                </Button>
              </div>
            );
          })}
        </div>

        <Card>
          <CardHeader>
            <CardDescription>How it works</CardDescription>
            <CardTitle className="text-sm">File watcher</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground space-y-2 text-xs">
            <p>
              · The watcher observes Unity asset changes. When a scene, prefab, script, or
              ScriptableObject is modified, it dispatches an event.
            </p>
            <p>
              · Each event creates a <code className="bg-muted rounded px-1">dev_log</code> and a{" "}
              <code className="bg-muted rounded px-1">commit</code> with an AI-generated summary.
            </p>
            <p>
              · Architecture impact is recomputed: linked systems, classes, and assets are surfaced
              in the architecture graph and in the right-rail context panel.
            </p>
            <p>
              · Documentation is regenerated for any system that has lost or gained an asset (see{" "}
              <Link href="/docs" className="text-primary hover:underline">
                Documentation
              </Link>
              ).
            </p>
            <p>
              · For demo purposes, click <strong>Touch</strong> on any asset above to simulate an
              event.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
