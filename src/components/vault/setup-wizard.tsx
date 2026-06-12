"use client";
import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Cloud, FolderOpen, X, Sparkles, ShieldCheck } from "lucide-react";
import { useVault } from "@/lib/stores/vault";
import { cn } from "@/lib/utils";
import { saveSettings } from "@/lib/vault/sync-engine";

export function SetupWizard() {
  const settings = useVault((s) => s.settings);
  const updateSettings = useVault((s) => s.updateSettings);
  const connect = useVault((s) => s.connect);
  const init = useVault((s) => s.init);
  const caps = useVault((s) => s.capabilities);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!settings.firstRunDone) {
      const t = setTimeout(() => setOpen(true), 600);
      return () => clearTimeout(t);
    }
  }, [settings.firstRunDone]);

  const close = async () => {
    await updateSettings({ firstRunDone: true });
    setOpen(false);
  };

  const pickObsidian = async () => {
    const ok = await connect();
    if (ok) {
      await updateSettings({ firstRunDone: true });
      setOpen(false);
    }
  };

  const pickLocal = async () => {
    await saveSettings({ mode: "local" });
    await init();
    await updateSettings({ firstRunDone: true });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-[color:var(--primary)]" />Welcome to MasarFlow</DialogTitle>
          <DialogDescription>Pick how you want to handle notes. You can change this later in Settings.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="cursor-pointer transition-colors hover:border-foreground/30" onClick={pickLocal}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm"><FolderOpen className="h-4 w-4" />Local notes <Badge variant="ghost" className="ml-auto">Default</Badge></CardTitle>
              <CardDescription>Built-in vault. Standard markdown. No setup. Exportable anytime.</CardDescription>
            </CardHeader>
            <CardContent className="text-[11px] text-muted-foreground">Works in every browser. All data stays in this browser.</CardContent>
          </Card>
          <Card className={cn("cursor-pointer transition-colors hover:border-foreground/30", !caps.fsa && !caps.webkit && "opacity-50")} onClick={pickObsidian}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm"><Cloud className="h-4 w-4" />Connect Obsidian</CardTitle>
              <CardDescription>Live sync with your vault folder. Requires Chrome, Edge, Arc, or Brave.</CardDescription>
            </CardHeader>
            <CardContent className="text-[11px] text-muted-foreground">
              {!caps.fsa && !caps.webkit ? "Not supported in your browser. Pick Local or Skip." : "Bidirectional. Last-write-wins."}
            </CardContent>
          </Card>
          <Card className="cursor-pointer transition-colors hover:border-foreground/30" onClick={close}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm"><X className="h-4 w-4" />Skip</CardTitle>
              <CardDescription>Start empty. Decide later from Settings.</CardDescription>
            </CardHeader>
            <CardContent className="text-[11px] text-muted-foreground">You can re-open this from Settings · Vault.</CardContent>
          </Card>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-border bg-surface-2 p-2 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />No data ever leaves your machine. Both modes are 100% local.
        </div>
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={close}>Skip for now</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

