"use client";
import * as React from "react";
import {
  FolderOpen,
  ShieldAlert,
  CheckCircle2,
  Info,
  ExternalLink,
  Cloud,
  HardDrive,
  Upload,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useVault } from "@/lib/stores/vault";
import { PushConfirmDialog } from "./push-confirm-dialog";

export function VaultPicker() {
  const caps = useVault((s) => s.capabilities);
  const settings = useVault((s) => s.settings);
  const vaultName = useVault((s) => s.vaultName);
  const status = useVault((s) => s.status);
  const lastError = useVault((s) => s.lastError);
  const connectionHealth = useVault((s) => s.connectionHealth);
  const connect = useVault((s) => s.connect);
  const reconnect = useVault((s) => s.reconnect);
  const disconnect = useVault((s) => s.disconnect);
  const forget = useVault((s) => s.forget);
  const repick = useVault((s) => s.repick);
  const clearError = useVault((s) => s.clearError);
  const runSync = useVault((s) => s.runSync);
  const importZip = useVault((s) => s.importZip);
  const [pushOpen, setPushOpen] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  if (
    settings.mode === "obsidian" ||
    settings.mode === "opfs" ||
    settings.mode === "legacy-fallback"
  ) {
    const isFallback = settings.backend === "legacy-fallback";
    const needsReauth = connectionHealth === "needs-reauth";
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <FolderOpen className="h-4 w-4 text-[color:var(--primary)]" />
            Connected vault
          </CardTitle>
          <CardDescription>
            {settings.backend === "native-fsa" &&
              "Live, two-way sync via the File System Access API."}
            {settings.backend === "opfs" &&
              "Files live in browser storage. Export as zip to round-trip."}
            {settings.backend === "legacy-fallback" &&
              "Read-only mirror in IndexedDB. Per-file download on push."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant={needsReauth ? "outline" : "default"}>
              {needsReauth ? (
                <ShieldAlert className="h-3 w-3" />
              ) : (
                <CheckCircle2 className="h-3 w-3" />
              )}
              {vaultName}
            </Badge>
            <Badge variant="outline" className="text-[10px] capitalize">
              {settings.backend?.replace("-", " ")}
            </Badge>
            <span className="text-muted-foreground text-[10px]">
              {needsReauth
                ? "permission expired"
                : settings.backendCapabilities?.inPlaceWrites
                  ? "in-place writes"
                  : "download on push"}
            </span>
          </div>
          {needsReauth && (
            <div className="flex items-center gap-2 rounded-md border border-[color:var(--warning)]/30 bg-[color:var(--warning)]/10 p-2 text-[11px] text-[color:var(--warning)]">
              <ShieldAlert className="h-3 w-3 shrink-0" />
              Vault permission expired. Click Reconnect to restore access without re-picking the
              folder.
            </div>
          )}
          {lastError && !needsReauth && (
            <div className="rounded-md border border-[color:var(--danger)]/30 bg-[color:var(--danger)]/10 p-2 text-[11px] text-[color:var(--danger)]">
              {lastError}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {needsReauth ? (
              <Button
                size="sm"
                variant="default"
                onClick={() => reconnect()}
                className="gap-1.5"
              >
                <RefreshCw className="h-3 w-3" />
                Reconnect
              </Button>
            ) : (
              <Button
                size="sm"
                variant="soft"
                onClick={() => runSync()}
                disabled={status === "syncing"}
              >
                {status === "syncing" ? "Syncing..." : "Sync now"}
              </Button>
            )}
            {isFallback && !needsReauth && (
              <Button size="sm" variant="soft" onClick={() => setPushOpen(true)}>
                Push to vault
              </Button>
            )}
            {isFallback && (
              <Button size="sm" variant="outline" onClick={() => repick()}>
                Re-pick folder
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => disconnect()}>
              Disconnect
            </Button>
            <Button size="sm" variant="ghost" onClick={() => forget()}>
              Forget vault
            </Button>
          </div>
        </CardContent>
        <PushConfirmDialog open={pushOpen} onOpenChange={setPushOpen} />
      </Card>
    );
  }

  if (!caps.webkitdirectory) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <ShieldAlert className="h-4 w-4 text-[color:var(--warning)]" />
            Browser not supported
          </CardTitle>
          <CardDescription>
            Vault sync needs a browser that supports file folder picking.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground space-y-2 text-[11px]">
          <div>
            You are using <Badge variant="ghost">{caps.browserName}</Badge>.
          </div>
          <ul className="ml-4 list-disc space-y-1">
            <li>Use Chrome, Edge, Arc, or Brave for live sync.</li>
            <li>On Firefox/Safari, MasarFlow runs in Local mode.</li>
            <li>You can still import/export zips to move data.</li>
          </ul>
        </CardContent>
      </Card>
    );
  }

  const iconFor = caps.fsa ? Cloud : caps.opfs ? HardDrive : FolderOpen;
  const Icon = iconFor;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Icon className="h-4 w-4" />
          Connect Obsidian vault
        </CardTitle>
        <CardDescription>
          {caps.fsa && "Live, two-way sync via the File System Access API."}
          {caps.opfs && !caps.fsa && "Synced through browser storage. Export as zip to round-trip."}
          {!caps.opfs &&
            !caps.fsa &&
            "Read-only mirror with per-file download. Import zip to bulk-load."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-muted-foreground flex items-center gap-2 text-[11px]">
          <Info className="h-3 w-3" />
          Browser: {caps.browserName}.
          <ExternalLink className="h-3 w-3" />
          <a
            className="underline"
            href="https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API"
            target="_blank"
            rel="noreferrer"
          >
            Learn more
          </a>
        </div>
        {lastError && (
          <div className="rounded-md border border-[color:var(--danger)]/30 bg-[color:var(--danger)]/10 p-2 text-[11px] text-[color:var(--danger)]">
            {lastError}
            <button onClick={clearError} className="ml-2 underline">
              dismiss
            </button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => connect()} disabled={status === "syncing"} className="gap-2">
            <FolderOpen className="h-4 w-4" />
            {caps.fsa ? "Pick vault folder" : "Open vault folder"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" />
            Import vault zip
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const n = await importZip(f);
              if (n > 0) {
                const { saveSettings } = await import("@/lib/vault/sync-engine-backend");
                await saveSettings({
                  mode: "legacy-fallback",
                  vaultName: f.name.replace(/\.zip$/i, ""),
                });
                clearError();
              }
              e.target.value = "";
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}
