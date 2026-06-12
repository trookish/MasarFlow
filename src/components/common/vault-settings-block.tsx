"use client";
import * as React from "react";
import { useVault } from "@/lib/stores/vault";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { RefreshCw, FolderOpen, Trash2, ShieldAlert } from "lucide-react";
import { getStorageUsage, clearAttachmentCache } from "@/lib/vault/attachments";
import { Row } from "./shared-row";

export function VaultSettingsBlock() {
  const settings = useVault((s) => s.settings);
  const updateSettings = useVault((s) => s.updateSettings);
  const vaultName = useVault((s) => s.vaultName);
  const lastError = useVault((s) => s.lastError);
  const clearError = useVault((s) => s.clearError);
  const status = useVault((s) => s.status);
  const lastResult = useVault((s) => s.lastResult);
  const runSync = useVault((s) => s.runSync);
  const runPull = useVault((s) => s.runPull);
  const runPush = useVault((s) => s.runPush);
  const connect = useVault((s) => s.connect);
  const disconnect = useVault((s) => s.disconnect);
  const forget = useVault((s) => s.forget);
  const caps = useVault((s) => s.capabilities);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={settings.mode === "obsidian" ? "default" : "ghost"}>
          {settings.mode === "obsidian" ? "Live - " + (vaultName || "?") : "Local"}
        </Badge>
        {settings.mode === "obsidian" && (
          <>
            <Button size="sm" variant="soft" disabled={status === "syncing"} onClick={() => runSync()}>
              <RefreshCw className={"h-3 w-3 " + (status === "syncing" ? "animate-spin" : "")} />Sync
            </Button>
            <Button size="sm" variant="ghost" onClick={() => runPull()}>Pull</Button>
            <Button size="sm" variant="ghost" onClick={() => runPush()}>Push</Button>
            <Button size="sm" variant="outline" onClick={() => disconnect()}>Disconnect</Button>
            <Button size="sm" variant="ghost" onClick={() => forget()}>Forget</Button>
          </>
        )}
        {settings.mode !== "obsidian" && (
          <Button size="sm" variant="default" onClick={() => connect()} disabled={!caps.fsa && !caps.webkit}>
            <FolderOpen className="h-3 w-3" />Connect Obsidian
          </Button>
        )}
      </div>
      {(!caps.fsa && !caps.webkit) && (
        <div className="flex items-center gap-2 rounded-md border border-[color:var(--warning)]/30 bg-[color:var(--warning)]/10 p-2 text-[11px] text-[color:var(--warning)]">
          <ShieldAlert className="h-3 w-3" />Your browser does not support the File System Access API. Use Chrome, Edge, Arc, or Brave to link a vault.
        </div>
      )}
      {lastError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-[11px] text-destructive">
          {lastError}
          <button onClick={clearError} className="ml-2 underline">dismiss</button>
        </div>
      )}
      {lastResult && (
        <div className="grid grid-cols-4 gap-2 text-[11px]">
          <Stat label="Scanned" v={lastResult.scanned} />
          <Stat label="Created" v={lastResult.created} />
          <Stat label="Updated" v={lastResult.updated} />
          <Stat label="Attach" v={lastResult.attachments} />
        </div>
      )}
      <Row
        label="Include archive folder"
        description="Sync 09. Archive/ contents."
        checked={settings.archiveIncluded}
        onChange={() => updateSettings({ archiveIncluded: !settings.archiveIncluded })}
      />
      <Row
        label="Include trash"
        description="Mirror vault .trash/ into Sync manager."
        checked={settings.trashIncluded}
        onChange={() => updateSettings({ trashIncluded: !settings.trashIncluded })}
      />
      <div className="rounded-md border border-border bg-surface-2 p-2.5">
        <div className="text-xs font-medium">Polling interval</div>
        <div className="mt-0.5 text-[10px] text-muted-foreground">Auto-sync every N ms. Set to 0 to disable.</div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {[{ k: 0, l: "Off" }, { k: 30000, l: "30s" }, { k: 300000, l: "5m" }, { k: 900000, l: "15m" }, { k: 3600000, l: "1h" }].map((p) => (
            <button
              key={p.k}
              onClick={() => updateSettings({ pollingMs: p.k })}
              className={cn(
                "rounded-md border px-2 py-1 text-[10px] transition-colors",
                settings.pollingMs === p.k ? "border-foreground/30 bg-accent" : "border-border hover:border-foreground/20",
              )}
            >{p.l}</button>
          ))}
        </div>
      </div>
      <div className="rounded-md border border-border bg-surface-2 p-2.5">
        <div className="text-xs font-medium">Attachment limits</div>
        <div className="mt-0.5 text-[10px] text-muted-foreground">Per-file and per-vault caps. MasarFlow caches attachments locally.</div>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground">Max per file (MB)</label>
            <Input
              type="number"
              min={1}
              max={500}
              value={Math.round(settings.maxAttachmentBytes / (1024 * 1024))}
              onChange={(e) => updateSettings({ maxAttachmentBytes: Math.max(1, Number(e.target.value || 1)) * 1024 * 1024 })}
              className="h-7 text-[10px] mt-1"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Max total (MB)</label>
            <Input
              type="number"
              min={10}
              max={5000}
              value={Math.round(settings.maxVaultBytes / (1024 * 1024))}
              onChange={(e) => updateSettings({ maxVaultBytes: Math.max(10, Number(e.target.value || 10)) * 1024 * 1024 })}
              className="h-7 text-[10px] mt-1"
            />
          </div>
        </div>
      </div>
      <div className="rounded-md border border-border bg-surface-2 p-2.5">
        <div className="text-xs font-medium">Cache</div>
        <div className="mt-0.5 text-[10px] text-muted-foreground">Cached attachment files live in IndexedDB.</div>
        <ClearCacheButton />
      </div>
    </div>
  );
}

function Stat({ label, v }: { label: string; v: number }) {
  return (
    <div className="rounded-md border border-border bg-surface-2 px-2 py-1">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-medium tabular-nums">{v}</div>
    </div>
  );
}

function ClearCacheButton() {
  const [usage, setUsage] = React.useState<{ totalBytes: number; count: number } | null>(null);
  const [clearing, setClearing] = React.useState(false);
  React.useEffect(() => {
    void getStorageUsage().then(setUsage);
  }, []);
  return (
    <div className="mt-1.5 flex items-center gap-2 text-[10px]">
      <span className="text-muted-foreground">
        {usage ? usage.count + " files - " + (usage.totalBytes / (1024 * 1024)).toFixed(1) + " MB" : "..."}
      </span>
      <Button
        size="sm"
        variant="outline"
        className="h-6 text-[10px]"
        disabled={clearing}
        onClick={async () => {
          setClearing(true);
          const n = await clearAttachmentCache();
          setClearing(false);
          setUsage({ totalBytes: 0, count: 0 });
          if (typeof window !== "undefined" && (window as unknown as { toast?: { success: (s: string) => void } }).toast) {
            (window as unknown as { toast: { success: (s: string) => void } }).toast.success("Cleared " + n + " cached files");
          }
        }}
      >
        <Trash2 className="h-3 w-3" />Clear
      </Button>
    </div>
  );
}
