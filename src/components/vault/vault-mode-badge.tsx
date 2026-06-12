"use client";
import * as React from "react";
import { Cloud, FolderOpen, WifiOff, CheckCircle2, HardDrive } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useVault } from "@/lib/stores/vault";
import { cn } from "@/lib/utils";
import type { VaultBackendKind } from "@/lib/vault/types";

const LABEL: Record<VaultBackendKind | "disconnected", string> = {
  "native-fsa": "Live",
  "opfs": "Synced",
  "legacy-fallback": "Cached",
  "local": "Local",
  "disconnected": "Disconnected",
};

const ICON: Record<VaultBackendKind | "disconnected", React.ComponentType<{ className?: string }>> = {
  "native-fsa": Cloud,
  "opfs": HardDrive,
  "legacy-fallback": FolderOpen,
  "local": FolderOpen,
  "disconnected": WifiOff,
};

export function VaultModeBadge({ className }: { className?: string }) {
  const settings = useVault((s) => s.settings);
  const vaultName = useVault((s) => s.vaultName);
  const kind = settings.backend && settings.backend !== "auto" ? settings.backend : "local";
  if (settings.mode === "disconnected") {
    const Icon = ICON.disconnected;
    return <Badge variant="outline" className={cn("gap-1", className)}><Icon className="h-3 w-3" />Disconnected</Badge>;
  }
  if (settings.mode === "local" && !vaultName) {
    const Icon = ICON.local;
    return <Badge variant="ghost" className={cn("gap-1", className)}><Icon className="h-3 w-3" />Local</Badge>;
  }
  if (vaultName) {
    const Icon = ICON[kind as VaultBackendKind];
    return (
      <Badge variant="default" className={cn("gap-1", className)}>
        <Icon className="h-3 w-3" />{LABEL[kind as VaultBackendKind]} · {vaultName}
      </Badge>
    );
  }
  return <Badge variant="ghost" className={cn("gap-1", className)}>Local</Badge>;
}
