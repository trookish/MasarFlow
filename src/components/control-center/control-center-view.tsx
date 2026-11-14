"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, Database, FolderOpen, KeyRound, RefreshCw, ScrollText } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { getDesktop } from "@/lib/desktop/bridge";
import { useMounted } from "@/lib/hooks/use-mounted";
import { AutoBackupsCard } from "@/components/settings/auto-backups-card";
import { backupNow } from "@/lib/db/auto-backup";
import { UpdatePanel } from "./update-panel";
import { Button } from "@/components/ui/button";

type Tab = "overview" | "roots" | "secrets" | "backups" | "logs" | "updates";

/** Keys the Control Center reports as present/absent. Labels only — never values. */
const SECRET_KEYS: Array<{ key: string; label: string }> = [
  { key: "github:pat", label: "GitHub token" },
  { key: "obsidian:api-key", label: "Obsidian local REST API key" },
];

export function ControlCenterView() {
  const mounted = useMounted();
  const desktop = mounted ? getDesktop() : null;
  const [tab, setTab] = useState<Tab>("overview");
  const [info, setInfo] = useState<{ version: string; displayVersion: string; userData: string; packaged: boolean } | null>(null);
  const [health, setHealth] = useState<string>("checking…");
  const [healthOk, setHealthOk] = useState<boolean | null>(null);
  const [roots, setRoots] = useState<string[]>([]);
  const [present, setPresent] = useState<Record<string, boolean>>({});
  const [connectionKeys, setConnectionKeys] = useState<string[]>([]);
  const [markdown, setMarkdown] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [hideOnClose, setHideOnClose] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/health").catch(() => null);
    const json = res ? ((await res.json().catch(() => null)) as { ok?: boolean; version?: string } | null) : null;
    setHealth(json?.ok ? `ok (build ${json.version ?? "?"})` : "no answer from the local service");
    setHealthOk(Boolean(json?.ok));
    if (!desktop) return;
    setInfo(await desktop.app.info());
    setRoots(await desktop.roots.list());
    const keys = SECRET_KEYS.map((k) => k.key);
    const { aiConnectionsRepo } = await import("@/lib/db/repos");
    const { aiKeySecret } = await import("@/lib/db/repos/chat-secrets");
    const connections = await aiConnectionsRepo.list(); // list(), not all() — src/lib/db/repos/chat.ts:13
    const connKeys = connections.map((c) => aiKeySecret(c.id));
    setConnectionKeys(connKeys);
    const all = [...keys, ...connKeys];
    const flags: Record<string, boolean> = {};
    for (const k of all) flags[k] = await desktop.secrets.has(k);
    setPresent(flags);
    const report = await desktop.diagnostics.collect({ secretKeys: all });
    setMarkdown(report.markdown);
    const s = await desktop.settings.get();
    setHideOnClose(Boolean(s.closeToTray));
  }, [desktop]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time load of external state
    void refresh();
  }, [refresh]);

  async function copyDiagnostics(): Promise<void> {
    const d = getDesktop();
    if (!d) return;
    await d.clipboard.writeText(markdown);
    setNote("Diagnostics copied to the clipboard (keys and foreign paths removed).");
  }

  const tabs: Array<{ id: Tab; label: string; icon: typeof Activity }> = [
    { id: "overview", label: "Overview", icon: Activity },
    { id: "roots", label: "Folders", icon: FolderOpen },
    { id: "secrets", label: "Secrets", icon: KeyRound },
    { id: "backups", label: "Backups", icon: Database },
    { id: "logs", label: "Logs", icon: ScrollText },
    { id: "updates", label: "Updates", icon: RefreshCw },
  ];

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-6" data-testid="control-center">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Control Center</h1>
          <p className="text-sm text-muted-foreground">
            {info ? `MasarFlow ${info.displayVersion} (${info.version}) · ${info.userData}` : "App information is loading."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void refresh()}>
            Refresh
          </Button>
          <Button onClick={() => void copyDiagnostics()} disabled={!markdown}>
            Copy diagnostics
          </Button>
        </div>
      </header>
      <nav className="flex flex-wrap gap-1" aria-label="Control Center sections">
        {tabs.map((t) => (
          <Button key={t.id} size="sm" variant={tab === t.id ? "default" : "ghost"} onClick={() => setTab(t.id)}>
            <t.icon className="mr-2 size-4" />
            {t.label}
          </Button>
        ))}
      </nav>
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
      {tab === "overview" ? (
        <section className="space-y-4 text-sm">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatusCard
              testId="cc-service"
              label="Local service"
              value={health}
              tone={healthOk === null ? "muted" : healthOk ? "ok" : "bad"}
            />
            <StatusCard
              label="Linked folders"
              value={roots.length === 0 ? "None yet" : String(roots.length)}
              tone={roots.length === 0 ? "muted" : "ok"}
              onOpen={() => setTab("roots")}
            />
            <StatusCard label="Automatic backups" value="Rolling, kept locally" tone="ok" onOpen={() => setTab("backups")} />
            <StatusCard
              label="Secrets stored"
              value={String(Object.values(present).filter(Boolean).length)}
              tone="muted"
              onOpen={() => setTab("secrets")}
            />
          </div>
          {desktop ? (
            <label className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm">
              <input
                type="checkbox"
                checked={hideOnClose}
                onChange={async (e) => {
                  setHideOnClose(e.target.checked);
                  await desktop.settings.set({ closeToTray: e.target.checked });
                }}
              />
              Keep MasarFlow running in the notification area when I close the window
            </label>
          ) : null}
        </section>
      ) : null}
      {tab === "roots" ? (
        <section className="space-y-2 text-sm">
          {roots.length === 0 ? <p className="text-muted-foreground">No folders linked yet. Link one from the wizard or a project.</p> : null}
          <ul className="space-y-1">
            {roots.map((r) => (
              <li key={r} className="font-mono text-xs">
                {r}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {tab === "secrets" ? (
        <section className="space-y-2 text-sm">
          <p className="text-muted-foreground">Only presence is shown; values never leave the OS credential store.</p>
          <ul className="space-y-1">
            {[
              ...SECRET_KEYS.map((s) => ({ key: s.key, label: s.label })),
              ...connectionKeys.map((k) => ({ key: k, label: `AI connection ${k.split(":")[1]?.slice(0, 8) ?? ""}` })),
            ].map((row) => (
              <li key={row.key}>
                {row.label}: {present[row.key] ? "present" : "absent"}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {tab === "backups" ? (
        <section className="space-y-3">
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void backupNow()}>
              Back up now
            </Button>
            <Button variant="ghost" onClick={() => void desktop?.backups.openFolder()}>
              Reveal backup folder
            </Button>
          </div>
          <AutoBackupsCard />
        </section>
      ) : null}
      {tab === "logs" ? (
        <section className="space-y-3">
          <p className="text-xs text-muted-foreground">
            The report below is what “Copy diagnostics” puts on your clipboard. Review it before pasting it anywhere.
          </p>
          {/* P8&apos;s handoff: the browser-side report lives in src/components/tools/system-panel.tsx
              and stays there for the web case. This one comes from the main process
              (diagnostics:collect) because roots/secrets/backups/updater only exist there.
              Do not "deduplicate" them into one function — they run in two different processes. */}
          <textarea
            readOnly
            value={markdown}
            data-testid="diagnostics-report"
            className="h-80 w-full rounded-md border border-border bg-muted/30 p-3 font-mono text-xs"
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void copyDiagnostics()}>
              Copy diagnostics
            </Button>
            <Button variant="ghost" onClick={() => void desktop?.logs.openFolder()}>
              Open logs folder
            </Button>
            <a className="text-xs underline" href="/tools/logs">
              Browse server logs →
            </a>
          </div>
          <p className="text-xs text-muted-foreground">
            Server logs rotate at 5 MB and rotated logs are deleted after 7 days; the report above ends with the most recent main-process lines.
          </p>
        </section>
      ) : null}
      {tab === "updates" ? <UpdatePanel /> : null}
    </div>
  );
}

function StatusCard({
  label,
  value,
  tone,
  testId,
  onOpen,
}: {
  label: string;
  value: string;
  tone: "ok" | "bad" | "muted";
  testId?: string;
  onOpen?: () => void;
}) {
  const body = (
    <>
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <span
          aria-hidden
          className={cn(
            "size-2 rounded-full",
            tone === "ok" && "bg-success",
            tone === "bad" && "bg-destructive",
            tone === "muted" && "bg-muted-foreground/50",
          )}
        />
        {label}
      </span>
      <span className="mt-1.5 block truncate text-sm font-medium text-foreground">{value}</span>
    </>
  );
  const cls = "rounded-lg border border-border bg-card px-4 py-3 text-left";
  return onOpen ? (
    <button
      type="button"
      data-testid={testId}
      onClick={onOpen}
      className={cn(cls, "cursor-pointer transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
    >
      {body}
    </button>
  ) : (
    <div data-testid={testId} className={cls}>
      {body}
    </div>
  );
}
