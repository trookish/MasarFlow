"use client";
import * as React from "react";
import { Cloud, FolderOpen, WifiOff, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useVault } from "@/lib/stores/vault";
import { cn } from "@/lib/utils";

export function VaultModeBadge({ className }: { className?: string }) {
  const settings = useVault((s) => s.settings);
  const vaultName = useVault((s) => s.vaultName);
  if (settings.mode === "obsidian" && vaultName) {
    return (
      <Badge variant="default" className={cn("gap-1", className)}>
        <Cloud className="h-3 w-3" />Live · {vaultName}
      </Badge>
    );
  }
  if (settings.mode === "disconnected") {
    return (
      <Badge variant="outline" className={cn("gap-1", className)}>
        <WifiOff className="h-3 w-3" />Disconnected
      </Badge>
    );
  }
  return (
    <Badge variant="ghost" className={cn("gap-1", className)}>
      <FolderOpen className="h-3 w-3" />Local
    </Badge>
  );
}
