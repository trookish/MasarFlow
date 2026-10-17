"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { getDesktop } from "@/lib/desktop/bridge";
import { useMounted } from "@/lib/hooks/use-mounted";
import { extractChangelogSection } from "@/lib/changelog";
import { describeUpdaterStatus, initialUpdaterStatus, type UpdateChannel, type UpdaterStatus } from "@desktop-shared/updater-status";
import { Button } from "@/components/ui/button";

const RELEASES_URL = "https://github.com/trookish/MasarFlow/releases";

/**
 * The real update panel (P10.T9) — replaces the T8 stub. All state comes from
 * the main process through `window.masarflow.updater`; nothing here decides
 * whether an update exists.
 */
export function UpdatePanel() {
  const mounted = useMounted();
  const desktop = mounted ? getDesktop() : null;
  const [status, setStatus] = useState<UpdaterStatus>(() => initialUpdaterStatus(""));
  const [displayVersion, setDisplayVersion] = useState("");
  const [channel, setChannel] = useState<UpdateChannel>("stable");
  const [changelog, setChangelog] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = getDesktop();
    if (!d) return;
    const info = await d.app.info();
    setDisplayVersion(info.displayVersion);
    setStatus(await d.updater.get());
    const s = await d.settings.get();
    setChannel(s.updateChannel === "test" ? "test" : "stable");
    setChangelog(await d.changelog.read());
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time load of main-process state
    void load();
    const d = getDesktop();
    if (!d) return;
    return d.updater.onStatus((s) => setStatus(s));
  }, [load]);

  async function pickChannel(next: UpdateChannel): Promise<void> {
    const d = getDesktop();
    if (!d) return;
    setChannel(next);
    setStatus(await d.updater.setChannel(next));
  }

  async function check(): Promise<void> {
    const d = getDesktop();
    if (!d) return;
    setNote(null);
    setStatus(await d.updater.check());
  }

  async function download(): Promise<void> {
    const d = getDesktop();
    if (!d) return;
    setStatus(await d.updater.download());
  }

  async function install(): Promise<void> {
    const d = getDesktop();
    if (!d) return;
    await d.updater.install();
  }

  if (!desktop) {
    return (
      <section className="space-y-2 text-sm">
        <p className="text-muted-foreground">
          Updates are managed by the MasarFlow desktop app. In a browser, use the topbar’s update check.
        </p>
      </section>
    );
  }

  const pendingVersion = status.availableVersion ?? displayVersion;
  const section = changelog ? extractChangelogSection(changelog, pendingVersion) : null;

  return (
    <section className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <p>
          Current version <span className="font-mono font-semibold">{displayVersion || "…"}</span>
        </p>
        <span className="flex items-center gap-1">
          <Button size="sm" variant={channel === "stable" ? "default" : "ghost"} onClick={() => void pickChannel("stable")}>
            Stable
          </Button>
          <Button size="sm" variant={channel === "test" ? "default" : "ghost"} onClick={() => void pickChannel("test")}>
            Test
          </Button>
        </span>
      </div>

      <p>{describeUpdaterStatus(status)}</p>

      {status.phase === "downloading" || status.phase === "ready" ? (
        <div
          className="h-1.5 w-full overflow-hidden rounded bg-muted"
          role="progressbar"
          aria-valuenow={status.percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full bg-primary transition-[width]" style={{ width: `${status.percent}%` }} />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => void check()}>
          Check now
        </Button>
        {status.phase === "available" ? <Button onClick={() => void download()}>Download</Button> : null}
        {status.phase === "ready" ? <Button onClick={() => void install()}>Restart now</Button> : null}
        <Button variant="ghost" onClick={() => void desktop.shell.openExternal(RELEASES_URL)}>
          <ExternalLink className="mr-2 size-3.5" /> Releases page
        </Button>
      </div>

      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}

      <div className="space-y-1">
        <h2 className="text-sm font-semibold">What changed</h2>
        {section ? (
          <pre className="whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 text-xs">{section}</pre>
        ) : (
          <p className="text-xs text-muted-foreground">
            {changelog ? `No changelog entry for ${pendingVersion || "this version"}.` : "No changelog shipped with this build."}
          </p>
        )}
      </div>

      <p className="text-xs text-warning">
        Installer updates are unsigned: Windows SmartScreen may ask you to confirm. More info → Run anyway.
      </p>
    </section>
  );
}
