import { CheckCircle2, ExternalLink, RefreshCw, X } from "lucide-react";
import { useState } from "react";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";

/** Fixed-overlay modal showing the GitHub update check result. */
export function UpdateDialog({ onClose }: { onClose: () => void }) {
  const info = useApp((s) => s.updateInfo);
  const setUpdateInfo = useApp((s) => s.setUpdateInfo);
  const [checking, setChecking] = useState(false);

  if (!info) return null;

  const check = async (): Promise<void> => {
    setChecking(true);
    try {
      setUpdateInfo(await window.masarFlow.updates.check());
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-lg border border-border bg-popover text-popover-foreground shadow-2xl">
        <div className="flex items-start justify-between gap-3 p-5 pb-2">
          <div>
            <h2 className="text-base font-semibold">Updates</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Compares this launcher against MasarFlow releases and commits on GitHub.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-2">
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card p-3 text-xs">
            <span>
              Installed <span className="font-mono font-semibold">{info.currentVersion}</span>
            </span>
            <span className="text-muted-foreground">→</span>
            <span>
              Latest{" "}
              <span className="font-mono font-semibold">
                {info.latestVersion || "unknown"}
              </span>
            </span>
            {info.updateAvailable ? (
              <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2 py-0.5 font-medium text-primary">
                Update available
              </span>
            ) : info.error ? (
              <span className="ml-auto rounded-full bg-warning/15 px-2 py-0.5 font-medium text-warning">
                Check failed
              </span>
            ) : (
              <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-node-lore/15 px-2 py-0.5 font-medium text-node-lore">
                <CheckCircle2 className="h-3 w-3" /> Up to date
              </span>
            )}
          </div>

          {info.error && (
            <p className="mt-2 text-xs text-warning">{info.error}</p>
          )}

          {info.latestCommit && (
            <div className="mt-2 rounded-md border border-border bg-card p-3 text-xs">
              <p className="font-medium text-muted-foreground">Latest commit on main</p>
              <p className="mt-1 truncate font-mono">
                <span className="text-primary">{info.latestCommit.sha}</span>{" "}
                {info.latestCommit.message}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {new Date(info.latestCommit.date).toLocaleString()}
              </p>
            </div>
          )}

          {info.releaseNotes && (
            <div className="scrollbar-thin mt-2 max-h-52 overflow-y-auto rounded-md border border-border bg-card p-3">
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                {info.releaseName}
                {info.publishedAt
                  ? ` · ${new Date(info.publishedAt).toLocaleDateString()}`
                  : ""}
              </p>
              <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed">
                {info.releaseNotes}
              </pre>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-5 pt-3">
          <Button variant="ghost" size="sm" onClick={check} disabled={checking}>
            <RefreshCw className={cn("h-3.5 w-3.5", checking && "animate-spin")} />
            {checking ? "Checking…" : "Check again"}
          </Button>
          {info.releaseUrl && (
            <Button
              size="sm"
              onClick={() => void window.masarFlow.updates.openRelease(info.releaseUrl)}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open release page
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
