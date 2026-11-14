"use client";
import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Sparkles,
  Link2,
  GitBranch,
  Boxes,
  Lightbulb,
  ArrowRight,
  ScrollText,
  RefreshCw,
  FolderOpen,
  Trash2,
} from "lucide-react";
import { useUi } from "@/lib/stores/ui";
import { useActiveProject } from "@/lib/db/repos/projects";
import { usePathname } from "next/navigation";
import { useMemories, useTasks, useDevLogs } from "@/lib/db/repos/misc";
import { useVault } from "@/lib/stores/vault";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn, formatRelativeTime } from "@/lib/utils";

interface RightRailPanel {
  id: string;
  title: string;
  icon: React.ReactNode;
  content: React.ReactNode;
}

function AiSuggestionsPanel() {
  const project = useActiveProject();
  const memories = useMemories(project?.id);
  const topMemories = React.useMemo(
    () =>
      memories
        ?.slice()
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 3) ?? [],
    [memories],
  );

  return (
    <div className="space-y-2">
      {topMemories.length === 0 && (
        <div className="border-border text-muted-foreground rounded-md border border-dashed p-3 text-xs">
          AI will surface memory hints here as the project grows.
        </div>
      )}
      {topMemories.map((m) => (
        <div key={m.id} className="border-border bg-surface-2 rounded-md border p-2.5 text-xs">
          <div className="mb-1 flex items-center gap-1.5">
            <Badge
              variant={
                m.kind === "decision" ? "info" : m.kind === "lesson" ? "warning" : "secondary"
              }
            >
              {m.kind}
            </Badge>
            <span className="text-muted-foreground ml-auto font-mono text-[10px]">
              {Math.round(m.weight * 100)}%
            </span>
          </div>
          <p className="text-foreground/90 text-pretty">{m.content}</p>
        </div>
      ))}
    </div>
  );
}

function ContextPanel() {
  const project = useActiveProject();
  const tasks = useTasks(project?.id);
  const inProgress = tasks?.filter((t) => t.status === "in_progress").slice(0, 3) ?? [];

  return (
    <div className="space-y-1.5">
      {inProgress.length === 0 ? (
        <div className="text-muted-foreground text-xs">Nothing in progress.</div>
      ) : (
        inProgress.map((t) => (
          <div
            key={t.id}
            className="border-border bg-surface-2 flex items-center gap-2 rounded-md border p-2 text-xs"
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--info)]" />
            <span className="flex-1 truncate">{t.title}</span>
            <span className="text-muted-foreground font-mono text-[10px]">{t.progress}%</span>
          </div>
        ))
      )}
    </div>
  );
}

function ArchitectureImpactPanel() {
  const items = [
    { label: "Climbing (in progress)", impact: "moderate", refs: 3 },
    { label: "Memory Echoes (review)", impact: "low", refs: 2 },
    { label: "Audio culling (shipped)", impact: "low", refs: 1 },
  ];
  return (
    <div className="space-y-1.5">
      {items.map((i) => (
        <div
          key={i.label}
          className="border-border bg-surface-2 flex items-center gap-2 rounded-md border p-2 text-xs"
        >
          <Boxes className="text-muted-foreground h-3.5 w-3.5" />
          <span className="flex-1 truncate">{i.label}</span>
          <Badge variant={i.impact === "moderate" ? "warning" : "ghost"}>{i.impact}</Badge>
        </div>
      ))}
    </div>
  );
}

function MemoryReferencesPanel() {
  const items = [
    "ADR-007: state dispatcher",
    "Standard 4: no allocations in Update",
    "Standard 5: events are Action / Func",
  ];
  return (
    <div className="space-y-1">
      {items.map((s) => (
        <div
          key={s}
          className="text-muted-foreground hover:bg-accent/40 flex items-center gap-2 rounded-md px-1.5 py-1 text-xs"
        >
          <Link2 className="h-3 w-3" />
          <span className="truncate">{s}</span>
          <ArrowRight className="ml-auto h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
      ))}
    </div>
  );
}

const PANELS: RightRailPanel[] = [
  {
    id: "ai",
    title: "AI Suggestions",
    icon: <Sparkles className="h-3.5 w-3.5" />,
    content: <AiSuggestionsPanel />,
  },
  {
    id: "ctx",
    title: "Context",
    icon: <GitBranch className="h-3.5 w-3.5" />,
    content: <ContextPanel />,
  },
  {
    id: "arch",
    title: "Architecture Impact",
    icon: <Boxes className="h-3.5 w-3.5" />,
    content: <ArchitectureImpactPanel />,
  },
  {
    id: "dev",
    title: "Recent dev logs",
    icon: <ScrollText className="h-3.5 w-3.5" />,
    content: <RecentDevPanel />,
  },
  {
    id: "mem",
    title: "Memory References",
    icon: <Lightbulb className="h-3.5 w-3.5" />,
    content: <MemoryReferencesPanel />,
  },
  {
    id: "vault",
    title: "Vault",
    icon: <FolderOpen className="h-3.5 w-3.5" />,
    content: <VaultPanel />,
  },
];

function VaultPanel() {
  const settings = useVault((s) => s.settings);
  const vaultName = useVault((s) => s.vaultName);
  const status = useVault((s) => s.status);
  const lastFullSync = useVault((s) => s.lastFullSync);
  const connectionHealth = useVault((s) => s.connectionHealth);
  const runSync = useVault((s) => s.runSync);
  const connect = useVault((s) => s.connect);
  const reconnect = useVault((s) => s.reconnect);
  const repick = useVault((s) => s.repick);
  const projectId = useLiveQuery(async () => (await getDb().projects.toArray())[0]?.id, []);
  const trashCount = useLiveQuery(
    async () => {
      if (!projectId) return 0;
      const all = await getDb().syncFiles.where({ projectId }).toArray();
      return all.filter(
        (f) => f.inTrash || f.status === "deleted-local" || f.status === "deleted-remote",
      ).length;
    },
    [projectId],
    0,
  );
  const needsReauth = connectionHealth === "needs-reauth";
  const isVaultMode =
    settings.mode === "obsidian" ||
    settings.mode === "opfs" ||
    settings.mode === "legacy-fallback";
  return (
    <div className="space-y-2">
      <div className="border-border bg-surface-2 rounded-md border p-2">
        <div className="flex items-center gap-1.5 text-[11px]">
          <FolderOpen className="h-3 w-3" />
          <span className="font-medium">{vaultName || "Local notes"}</span>
          <span className="text-muted-foreground ml-auto text-[10px] capitalize">
            {needsReauth
              ? "needs reconnect"
              : (settings.backend || settings.mode).replace("-", " ")}
          </span>
        </div>
        <div className="text-muted-foreground mt-1 text-[10px]">
          {lastFullSync ? "Synced " + formatRelativeTime(lastFullSync) : "Not yet synced"}
        </div>
        <div className="mt-1.5 flex items-center gap-1">
          {isVaultMode ? (
            <>
              {needsReauth ? (
                <Button
                  size="sm"
                  variant="soft"
                  className="h-6 text-[10px]"
                  onClick={() => reconnect()}
                >
                  <RefreshCw className="h-3 w-3" />
                  Reconnect
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="soft"
                  className="h-6 text-[10px]"
                  disabled={status === "syncing"}
                  onClick={() => runSync()}
                >
                  <RefreshCw className={"h-3 w-3 " + (status === "syncing" ? "animate-spin" : "")} />
                  Sync
                </Button>
              )}
              {settings.mode === "legacy-fallback" && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[10px]"
                  onClick={() => repick()}
                >
                  Re-pick
                </Button>
              )}
            </>
          ) : (
            <Button size="sm" variant="soft" className="h-6 text-[10px]" onClick={() => connect()}>
              <FolderOpen className="h-3 w-3" />
              Connect
            </Button>
          )}
        </div>
      </div>
      <div className="border-border/60 bg-card/40 flex items-center gap-1.5 rounded-md border p-2 text-[10px]">
        <Trash2 className="h-3 w-3" />
        Trash: {trashCount}
      </div>
    </div>
  );
}

function RecentDevPanel() {
  const project = useActiveProject();
  const devLogs = useDevLogs(project?.id);
  const recentDev =
    devLogs
      ?.slice()
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 4) ?? [];
  return (
    <div className="space-y-1.5">
      {recentDev.length === 0 ? (
        <div className="text-muted-foreground text-xs">No dev logs yet.</div>
      ) : (
        recentDev.map((d) => (
          <div
            key={d.id}
            className="border-border/60 bg-surface-2 rounded-md border p-2 text-[11px]"
          >
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="text-[9px] capitalize">
                {d.kind}
              </Badge>
              <span className="text-muted-foreground ml-auto text-[10px]">
                {formatRelativeTime(d.createdAt)}
              </span>
            </div>
            <div className="mt-1 leading-snug text-pretty">{d.title}</div>
            {d.body && (
              <div className="text-muted-foreground mt-0.5 line-clamp-2 text-[10px]">{d.body}</div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

export function RightRail() {
  const collapsed = useUi((s) => s.rightRailCollapsed);
  const pathname = usePathname();
  void pathname;

  return (
    <AnimatePresence initial={false}>
      {!collapsed && (
        <motion.aside
          key="right-rail"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 320, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
          className="border-border bg-background relative z-10 hidden h-full shrink-0 overflow-hidden border-l lg:flex lg:flex-col"
        >
          <div className="border-border flex h-12 items-center justify-between border-b px-4">
            <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
              Context
            </span>
          </div>
          <ScrollArea className="flex-1">
            <div className="space-y-5 p-4">
              {PANELS.map((p, idx) => (
                <section key={p.id} className={cn(idx > 0 && "")}>
                  <header className="mb-2 flex items-center gap-2">
                    <span className="text-muted-foreground">{p.icon}</span>
                    <h3 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                      {p.title}
                    </h3>
                  </header>
                  {p.content}
                  {idx < PANELS.length - 1 && <Separator className="mt-4" />}
                </section>
              ))}
            </div>
          </ScrollArea>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
