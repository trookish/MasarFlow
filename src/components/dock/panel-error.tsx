"use client";

/**
 * Crash isolation for dock panels. The dock is a window manager: one page
 * throwing must never take the shell (tabs, other splits, floaters) with it.
 * React has no hook-based equivalent, so this is the one class component in
 * the dock.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";
import { CircleAlert, RefreshCw } from "lucide-react";
import { getPageDef } from "@/lib/dock/registry";
import { pageIdOf } from "@/lib/dock/types";

interface Props {
  panelId: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class PanelErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // The dock has no logger; the console is the honest place for this.
    console.error(`[dock] panel ${this.props.panelId} crashed`, error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const label = getPageDef(this.props.panelId)?.label ?? pageIdOf(this.props.panelId);
    return (
      <div
        role="alert"
        className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center"
      >
        <CircleAlert className="h-8 w-8 text-destructive" />
        <div className="space-y-1">
          <p className="text-sm font-medium">{label} stopped responding</p>
          <p className="max-w-md text-xs text-muted-foreground">
            The rest of the workspace is unaffected. Reload the panel, or close it and reopen it
            from the command palette. The technical detail is in the developer console.
          </p>
        </div>
        <p className="max-w-md truncate rounded border border-border bg-card px-2 py-1 font-mono text-[11px] text-muted-foreground">
          {error.message}
        </p>
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Reload panel
        </button>
      </div>
    );
  }
}

/** A panel id with no component in PAGE_COMPONENTS (a nav entry without a route). */
export function PanelMissing({ panelId }: { panelId: string }) {
  const label = getPageDef(panelId)?.label ?? pageIdOf(panelId);
  return (
    <div role="alert" className="flex h-full w-full flex-col items-center justify-center gap-2 p-6 text-center">
      <CircleAlert className="h-6 w-6 text-muted-foreground" />
      <p className="text-sm font-medium">{label} is not available in this build</p>
      <p className="max-w-sm text-xs text-muted-foreground">
        It is listed in the sidebar but has no panel component. Close this panel or choose another
        one from the command palette.
      </p>
    </div>
  );
}
