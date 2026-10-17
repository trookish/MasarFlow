"use client";

/**
 * System info: versions, paths, the folder allow-list, local storage usage and
 * MasarFlow's own (redacted) environment. READ-ONLY by design — the editable
 * environment/settings surface is P10's Settings → System + AI Providers
 * (master D1). Everything here is a fact the app already knows; nothing here
 * changes state, and secret-looking values are masked before they reach this
 * window.
 */

import { useEffect, useMemo, useState } from "react";
import { Ban, CircleCheck, Copy, FolderOpen, Info, MonitorCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getDesktop } from "@/lib/desktop/bridge";
import { db } from "@/lib/db";
import { useActiveProjectId } from "@/lib/hooks/use-project";
import { linkedProjectsRepo } from "@/lib/db/repos";
import { describeRoot, formatBytes, storageSummary } from "@/lib/tools/system";
import { pushToast } from "@/lib/stores/toast";
import type { EnvRow } from "@desktop-shared/redact";

interface AppInfo {
  version: string;
  displayVersion: string;
  userData: string;
  packaged: boolean;
}

interface Row {
  label: string;
  value: string;
  hint?: string;
}

export function SystemPanel() {
  const desktop = useMemo(() => getDesktop(), []);
  const projectId = useActiveProjectId();
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [roots, setRoots] = useState<{ path: string; allowed: boolean }[]>([]);
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  const [counts, setCounts] = useState<{ table: string; count: number }[]>([]);
  const [env, setEnv] = useState<EnvRow[]>([]);

  useEffect(() => {
    void (async () => {
      if (desktop) {
        setInfo(await desktop.app.info());
        setEnv(await desktop.app.env());
        const registered = await desktop.roots.list();
        const linked = projectId ? await linkedProjectsRepo.listByProject(projectId) : [];
        const seen = new Set<string>();
        const rows: { path: string; allowed: boolean }[] = [];
        for (const root of linked) {
          seen.add(root.rootPath);
          rows.push({ path: root.rootPath, allowed: await desktop.roots.covers(root.rootPath) });
        }
        for (const path of registered) {
          if (!seen.has(path)) rows.push({ path, allowed: true });
        }
        setRoots(rows);
      }
      if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
        const estimate = await navigator.storage.estimate();
        setStorage({ usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 });
      }
      const tables: { table: string; count: number }[] = [];
      for (const table of db.tables) {
        tables.push({ table: table.name, count: await table.count() });
      }
      setCounts(tables.sort((a, b) => b.count - a.count));
    })();
  }, [desktop, projectId]);

  const appRows: Row[] = [
    { label: "MasarFlow", value: info ? info.displayVersion : "unknown", hint: "Application version" },
    { label: "Runtime", value: info?.packaged ? "Packaged desktop app" : "Development run", hint: "Packaged builds ship their own server" },
    { label: "Platform", value: desktop ? `${desktop.platform}` : "web browser", hint: "Where the workspace is running" },
    { label: "Data folder", value: info?.userData ?? "Only the desktop app knows this path", hint: "Database, logs and roots.json live here" },
    { label: "Workspace storage", value: storage ? `${formatBytes(storage.usage)} of ${formatBytes(storage.quota)} (${storageSummary(storage.usage, storage.quota)})` : "measuring…", hint: "Local IndexedDB quota for this origin" },
  ];

  if (!desktop) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-auto">
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <MonitorCog className="h-4 w-4 text-muted-foreground" />
          <div>
            <h2 className="text-sm font-medium">System info</h2>
            <p className="text-xs text-muted-foreground">
              What you are running and where your data is. Read-only — change settings in Settings.
            </p>
          </div>
        </header>
        <section aria-label="Runtime" className="border-b border-border px-4 py-3">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {appRows.map((row) => (
              <div key={row.label}>
                <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  {row.label}
                </dt>
                <dd className="truncate font-mono text-xs" title={row.value}>
                  {row.value}
                </dd>
                {row.hint ? <p className="text-[11px] text-muted-foreground">{row.hint}</p> : null}
              </div>
            ))}
          </dl>
        </section>
        <section aria-label="Local data" className="px-4 py-3">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Local data
          </h3>
          <ul className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
            {counts.map((row) => (
              <li key={row.table} className="flex items-center justify-between text-xs">
                <span className="truncate text-muted-foreground">{row.table}</span>
                <span className="font-mono">{row.count}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            The desktop app additionally reports versions, paths, allowed folders and MasarFlow&apos;s own
            environment. Editable environment settings (API keys, providers, .env values) arrive with
            Settings → System + AI Providers — this panel stays read-only on purpose.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <MonitorCog className="h-4 w-4 text-muted-foreground" />
        <div>
          <h2 className="text-sm font-medium">System info</h2>
          <p className="text-xs text-muted-foreground">
            What you are running and where your data is. Read-only — change settings in Settings.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => {
            const report = [
              ...appRows.map((r) => `${r.label}: ${r.value}`),
              "",
              "Registered folders:",
              ...roots.map((r) => describeRoot(r.path, r.allowed)),
              "",
              "Environment (secrets redacted):",
              ...env.map((r) => `${r.key}=${r.value}`),
            ].join("\n");
            void navigator.clipboard.writeText(report);
            pushToast({ title: "Diagnostics copied", tone: "success" });
          }}
        >
          <Copy className="h-3.5 w-3.5" /> Copy diagnostics
        </Button>
      </header>

      <section aria-label="Runtime" className="border-b border-border px-4 py-3">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          {appRows.map((row) => (
            <div key={row.label}>
              <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                {row.label}
              </dt>
              <dd className="truncate font-mono text-xs" title={row.value}>
                {row.value}
              </dd>
              {row.hint ? <p className="text-[11px] text-muted-foreground">{row.hint}</p> : null}
            </div>
          ))}
        </dl>
      </section>

      <section aria-label="Environment" className="border-b border-border px-4 py-3">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Environment
        </h3>
        {env.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            No MasarFlow environment variables are set for this run.
          </p>
        ) : (
          <ul className="mt-2 space-y-1">
            {env.map((row) => (
              <li key={row.key} className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">
                  {row.key}
                </span>
                <span
                  className={
                    row.redacted
                      ? "shrink-0 text-[11px] text-muted-foreground italic"
                      : "max-w-64 shrink-0 truncate font-mono"
                  }
                  title={row.redacted ? "Hidden: this value looks like a secret" : row.value}
                >
                  {row.value}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-[11px] text-muted-foreground">
          Values that look like secrets (token, key, secret, password) are masked before they ever
          reach this window.
        </p>
      </section>

      <section aria-label="Allowed folders" className="border-b border-border px-4 py-3">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Folders the app may use
        </h3>
        {roots.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            None yet. Link a project folder in <span className="font-medium">Chat → Linked folders</span>; the
            agent and the terminal can only work inside those folders.
          </p>
        ) : (
          <ul className="mt-2 space-y-1">
            {roots.map((root) => (
              <li key={root.path} className="flex items-center gap-2 text-xs">
                {root.allowed ? (
                  <CircleCheck className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Ban className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 truncate font-mono">{root.path}</span>
                <span className="text-muted-foreground">{describeRoot(root.path, root.allowed)}</span>
              </li>
            ))}
          </ul>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={() => void desktop.app.openLogs()}
        >
          <FolderOpen className="h-3.5 w-3.5" /> Open logs folder
        </Button>
      </section>

      <section aria-label="Local data" className="px-4 py-3">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Local data
        </h3>
        <ul className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
          {counts.map((row) => (
            <li key={row.table} className="flex items-center justify-between text-xs">
              <span className="truncate text-muted-foreground">{row.table}</span>
              <span className="font-mono">{row.count}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          Editable environment settings (API keys, providers, .env values) arrive with Settings → System +
          AI Providers. This panel stays read-only on purpose so there is exactly one place to change them.
        </p>
      </section>
    </div>
  );
}
