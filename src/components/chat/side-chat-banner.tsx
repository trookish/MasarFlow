"use client";

import { ArrowLeft, GitBranch, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shown at the top of a side chat: what it shares with the main thread and the
 * way back. Nothing typed in a side chat reaches the main thread.
 */
export function SideChatBanner({
  mainTitle,
  sharedCount,
  onReturn,
  onDiscard,
}: {
  mainTitle: string | null;
  sharedCount: number;
  onReturn: () => void;
  onDiscard: () => void;
}) {
  return (
    <div
      role="status"
      data-testid="side-chat-banner"
      className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-accent/30 px-3 py-1.5 text-xs"
    >
      <GitBranch className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
      <p className="min-w-0 flex-1 text-muted-foreground">
        <span className="font-medium text-foreground">Side chat.</span> Shares{" "}
        {sharedCount} {sharedCount === 1 ? "message" : "messages"} of{" "}
        {mainTitle ? `"${mainTitle}"` : "the main thread"} as context. Messages
        here never appear in the main thread.
      </p>
      <Button
        variant="outline"
        size="sm"
        onClick={onReturn}
        title="Leave this side chat and show the main thread"
        className="h-6 px-2 text-xs"
      >
        <ArrowLeft className="h-3 w-3" aria-hidden /> Return to main thread
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={onDiscard}
        title="Delete this side chat and return to the main thread"
        aria-label="Discard this side chat"
        className="h-6 px-2 text-xs text-muted-foreground"
      >
        <Trash2 className="h-3 w-3" aria-hidden /> Discard
      </Button>
    </div>
  );
}
