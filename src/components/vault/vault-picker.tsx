"use client";
import * as React from "react";
import { FolderOpen, ShieldAlert, CheckCircle2, Info, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useVault } from "@/lib/stores/vault";

export function VaultPicker() {
  const caps = useVault((s) => s.capabilities);
  const settings = useVault((s) => s.settings);
  const vaultName = useVault((s) => s.vaultName);
  const status = useVault((s) => s.status);
  const lastError = useVault((s) => s.lastError);
  const connect = useVault((s) => s.connect);
  const disconnect = useVault((s) => s.disconnect);
  const forget = useVault((s) => s.forget);
  const clearError = useVault((s) => s.clearError);
  const runSync = useVault((s) => s.runSync);

  if (settings.mode === "obsidian" && vaultName) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm"><FolderOpen className="h-4 w-4 text-[color:var(--primary)]" />Connected vault</CardTitle>
          <CardDescription>This vault is linked via the File System Access API.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant="default"><CheckCircle2 className="h-3 w-3" />{vaultName}</Badge>
            <span className="text-[10px] text-muted-foreground">read + write</span>
          </div>
          {lastError && <div className="rounded-md border border-[color:var(--danger)]/30 bg-[color:var(--danger)]/10 p-2 text-[11px] text-[color:var(--danger)]">{lastError}</div>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="soft" onClick={() => runSync()} disabled={status === "syncing"}>{status === "syncing" ? "Syncing..." : "Sync now"}</Button>
            <Button size="sm" variant="outline" onClick={() => disconnect()}>Disconnect</Button>
            <Button size="sm" variant="ghost" onClick={() => forget()}>Forget vault</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!caps.fsa && !caps.webkit) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm"><ShieldAlert className="h-4 w-4 text-[color:var(--warning)]" />Browser not supported</CardTitle>
          <CardDescription>Obsidian Live Sync needs a Chromium-based browser.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-[11px] text-muted-foreground">
          <div>You are using <Badge variant="ghost">{caps.browserName}</Badge>.</div>
          <ul className="ml-4 list-disc space-y-1">
            <li>Use Chrome, Edge, Arc, or Brave for live sync.</li>
            <li>On Firefox/Safari, MasarFlow runs in <b>Local mode</b> with built-in notes.</li>
            <li>You can still import/export zips to move data.</li>
          </ul>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm"><FolderOpen className="h-4 w-4" />Connect Obsidian vault</CardTitle>
        <CardDescription>Pick your vault folder. MasarFlow will request read/write permission.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Info className="h-3 w-3" />Browser: {caps.browserName}.
          <ExternalLink className="h-3 w-3" />
          <a className="underline" href="https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API" target="_blank" rel="noreferrer">Learn more</a>
        </div>
        {lastError && <div className="rounded-md border border-[color:var(--danger)]/30 bg-[color:var(--danger)]/10 p-2 text-[11px] text-[color:var(--danger)]">{lastError}<button onClick={clearError} className="ml-2 underline">dismiss</button></div>}
        <Button onClick={() => connect()} disabled={status === "syncing"} className="gap-2">
          <FolderOpen className="h-4 w-4" />Pick vault folder
        </Button>
      </CardContent>
    </Card>
  );
}
