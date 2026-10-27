"use client";

import { CheckCircle2, ExternalLink, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useUpdatesStore } from "@/lib/stores/updates";
import { getDesktop } from "@/lib/desktop/bridge";
import { describeUpdaterStatus } from "@desktop-shared/updater-status";
import { cn } from "@/lib/utils/cn";

/** Dialog showing the update check result (releases + commits). */
export function UpdateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const info = useUpdatesStore((s) => s.info);
  const state = useUpdatesStore((s) => s.state);
  const check = useUpdatesStore((s) => s.check);
  const updaterStatus = useUpdatesStore((s) => s.updaterStatus);
  const updaterAction =
    updaterStatus && ["available", "downloading", "ready"].includes(updaterStatus.phase) ? updaterStatus : null;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      className="max-w-lg"
      ariaLabel="Updates"
    >
      <DialogHeader>
        <DialogTitle>Updates</DialogTitle>
        <DialogDescription>
          Compares this app against MasarFlow releases and commits on GitHub.
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        {updaterAction ? (
          <div className="mb-3 space-y-2 rounded-md border border-border bg-card p-3 text-xs">
            <p>{describeUpdaterStatus(updaterAction)}</p>
            {updaterAction.phase !== "ready" ? (
              <p className="text-muted-foreground">The installer is unsigned; Windows SmartScreen may ask you to confirm.</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {updaterAction.phase === "available" ? (
                <Button size="sm" onClick={() => void getDesktop()?.updater.download()}>
                  Download
                </Button>
              ) : null}
              {updaterAction.phase === "ready" ? (
                <Button size="sm" onClick={() => void getDesktop()?.updater.install()}>
                  Restart now
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
        {info ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card p-3 text-xs">
              <span>
                Installed{" "}
                <span className="font-mono font-semibold">
                  {info.currentVersion}
                </span>
              </span>
              <span className="text-muted-foreground">→</span>
              <span>
                Latest{" "}
                <span className="font-mono font-semibold">
                  {info.latestVersion || "unknown"}
                </span>
              </span>
              {info.updateAvailable ? (
                <span className="ml-auto inline-flex items-center rounded-full bg-primary/15 px-2 py-0.5 font-medium text-primary">
                  Update available
                </span>
              ) : info.error ? (
                <span className="ml-auto rounded-full bg-warning/15 px-2 py-0.5 font-medium text-warning">
                  Check failed
                </span>
              ) : (
                <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2 py-0.5 font-medium text-success">
                  <CheckCircle2 className="h-3 w-3" /> Up to date
                </span>
              )}
            </div>

            {info.error ? (
              <p className="text-xs text-warning">{info.error}</p>
            ) : null}

            {info.latestCommit ? (
              <div className="rounded-md border border-border bg-card p-3 text-xs">
                <p className="font-medium text-muted-foreground">
                  Latest commit on main
                </p>
                <p className="mt-1 truncate font-mono">
                  <span className="text-primary">{info.latestCommit.sha}</span>{" "}
                  {info.latestCommit.message}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {new Date(info.latestCommit.date).toLocaleString()}
                </p>
              </div>
            ) : null}

            {info.releaseNotes ? (
              <div className="rounded-md border border-border bg-card p-3">
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  {info.releaseName}
                  {info.publishedAt
                    ? ` · ${new Date(info.publishedAt).toLocaleDateString()}`
                    : ""}
                </p>
                <ScrollArea className="max-h-52">
                  <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed">
                    {info.releaseNotes}
                  </pre>
                </ScrollArea>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="py-4 text-center text-xs text-muted-foreground">
            Checking GitHub for the latest release and commits…
          </p>
        )}
      </DialogBody>
      <DialogFooter>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void check()}
          disabled={state === "checking"}
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", state === "checking" && "animate-spin")}
          />
          {state === "checking" ? "Checking…" : "Check again"}
        </Button>
        {info?.releaseUrl ? (
          <a href={info.releaseUrl} target="_blank" rel="noreferrer">
            <Button size="sm">
              <ExternalLink className="h-3.5 w-3.5" /> Open release page
            </Button>
          </a>
        ) : null}
        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
          Close
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
