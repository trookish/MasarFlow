"use client";

import { useEffect, useState } from "react";
import { useInspectorView } from "@/components/entity/inspector";
import { GitBranch, MousePointerClick } from "lucide-react";
import { KIND_META } from "@/lib/entities/registry";
import { useInspectorSelection } from "@/lib/inspector/selection";
import { useMounted } from "@/lib/hooks/use-mounted";
import { cn } from "@/lib/utils/cn";
import { useGithub } from "@/lib/stores/github";
import { useUIStore } from "@/lib/stores/ui";
import { relativeTime } from "@/lib/ui/relative-time";

/**
 * The bottom edge of the window: the one place that answers "what am I pointing at, and where does
 * this project stand?" without taking a row from the page. Deliberately sparse — a status bar that
 * repeats the topbar is noise.
 */
export function StatusBar() {
  const mounted = useMounted();
  // Same key the Inspector itself resolves, so the two can never disagree about "selected".
  const { view } = useInspectorView();
  const selectionKey = view.selectionKey ?? "";
  const published = useInspectorSelection(
    (s) => s.selections[selectionKey] ?? null,
  );
  // Pages with URL-backed selections (a task, a spec) publish nothing: the URL *is* the selection,
  // and `view.ref` is that same derivation the Inspector uses.
  const ref = view.ref ?? published?.ref ?? null;
  const card = ref ? null : (published?.card ?? null);
  const setRevealed = useInspectorSelection((s) => s.setRevealed);
  const setInspectorOpen = useUIStore((s) => s.setInspectorOpen);
  const inspectorOpen = useUIStore((s) => s.inspectorOpen);
  const branch = useGithub((s) => s.branch);
  const repo = useGithub((s) => s.repo);
  const lastSyncedAt = useGithub((s) => s.lastSyncedAt);

  // A ticking clock, so "5m ago" stays true without re-rendering the app every second.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const selected = ref ? KIND_META[ref.kind] : null;
  const selectionLabel = selected
    ? `${selected.label} selected`
    : card
      ? `${card.kicker} selected`
      : "Nothing selected";
  const syncText =
    lastSyncedAt && mounted
      ? `Synced ${relativeTime(lastSyncedAt, now)}`
      : "Not synced yet";
  const repoLabel = [repo, branch].filter(Boolean).join("@");

  return (
    <footer
      role="contentinfo"
      aria-label="Status bar"
      className="flex h-[var(--statusbar-h)] shrink-0 items-center gap-3 overflow-hidden border-t border-border bg-background/80 px-3 text-xs text-muted-foreground"
    >
      <button
        type="button"
        onClick={() => {
          if (!inspectorOpen) setInspectorOpen(true);
          setRevealed(true);
        }}
        aria-label="Show the Inspector"
        title={
          selected
            ? `${selected.label} selected — open it in the Inspector`
            : "Nothing is selected — open the Inspector"
        }
        className={cn(
          "flex min-w-0 items-center gap-1.5 rounded-sm px-1 py-0.5 text-left hover:bg-accent hover:text-foreground",
          "focus-visible:ring-1 focus-visible:ring-primary focus-visible:outline-none",
        )}
      >
        <MousePointerClick className="h-3 w-3 shrink-0" aria-hidden />
        <span className="truncate">{selectionLabel}</span>
      </button>

      <div className="ml-auto flex shrink-0 items-center gap-3">
        {branch ? (
          <span
            className="flex items-center gap-1"
            title={repo ? `GitHub: ${repo} on ${branch}` : `Branch ${branch}`}
          >
            <GitBranch className="h-3 w-3" aria-hidden />
            {repoLabel}
          </span>
        ) : (
          <span title="Connect a GitHub repository in Settings to track a branch here">
            No repository
          </span>
        )}
        <span title="Last time MasarFlow pulled from GitHub">{syncText}</span>
      </div>
    </footer>
  );
}
