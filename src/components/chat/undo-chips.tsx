"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, Undo2, GitCompareArrows } from "lucide-react";
import { aiUndoRepo } from "@/lib/db/repos";
import type { AiUndo } from "@/lib/db/schema";

/**
 * Revert chips for AI-made workspace changes. Lists every recorded undo entry
 * belonging to the assistant message and offers one-click rollback (restore,
 * delete, or re-add the entity) plus an expandable before/after diff. The
 * ledger row is consumed on revert, so the live query clears the chip
 * automatically.
 */
export function UndoChips({
  messageId,
  busy,
}: {
  messageId: string;
  busy: boolean;
}) {
  const [reverted, setReverted] = useState<string | null>(null);
  const [openDiff, setOpenDiff] = useState<string | null>(null);
  const entries = useLiveQuery(
    () => aiUndoRepo.listByMessage(messageId),
    [messageId],
  );

  if (!entries || entries.length === 0) return null;

  async function revert(entryId: string) {
    const list = entries;
    if (!list) return;
    const entry = list.find((e) => e.id === entryId);
    if (!entry) return;
    try {
      const label = await aiUndoRepo.revert(entry);
      setReverted(`${entry.toolName}: ${label}`);
      setTimeout(() => setReverted(null), 2500);
    } catch {
      setReverted("Revert failed — the entity may have changed since.");
      setTimeout(() => setReverted(null), 3500);
    }
  }

  return (
    <div className="mb-1.5">
      <div className="flex flex-wrap items-center gap-1">
        {entries.map((e) => (
          <span
            key={e.id}
            className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-xs text-muted-foreground"
            title={`AI ${e.action} via ${e.toolName}`}
          >
            <Undo2 className="h-3 w-3 text-primary" />
            <span className="max-w-40 truncate">{aiUndoRepo.describe(e)}</span>
            {e.before !== null && e.after !== null && (
              <button
                type="button"
                aria-label="Show diff"
                onClick={() => setOpenDiff(openDiff === e.id ? null : e.id)}
                className="rounded px-1 font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Diff
              </button>
            )}
            <button
              type="button"
              aria-label="Undo this AI change"
              disabled={busy}
              onClick={() => void revert(e.id)}
              className="rounded px-1 font-medium text-primary hover:bg-primary/15 hover:text-primary"
            >
              Undo
            </button>
          </span>
        ))}
        {reverted && (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            <Check className="h-3 w-3 text-node-lore-fg" /> {reverted}
          </span>
        )}
      </div>
      {openDiff && (
        <DiffPreview entry={entries.find((e) => e.id === openDiff) ?? null} />
      )}
    </div>
  );
}

/** Compact before/after diff of the entity fields an AI change touched. */
function DiffPreview({ entry }: { entry: AiUndo | null }) {
  if (!entry) return null;
  const before = (entry.before ?? {}) as Record<string, unknown>;
  const after = (entry.after ?? {}) as Record<string, unknown>;
  const keys = Array.from(
    new Set([...Object.keys(before), ...Object.keys(after)]),
  )
    .filter((k) => !["id", "projectId", "createdAt", "updatedAt"].includes(k))
    .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));

  if (keys.length === 0) return null;

  const fmt = (v: unknown): string => {
    if (typeof v === "string") return v;
    return JSON.stringify(v, null, 2);
  };

  return (
    <div className="mt-1 max-h-64 overflow-y-auto rounded-md border border-border/60 bg-muted/30 p-2">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <GitCompareArrows className="h-3 w-3" />
        Changed by {entry.toolName} — click Undo above to roll back
      </div>
      {keys.map((k) => (
        <div key={k} className="mb-2 last:mb-0">
          <div className="mb-0.5 font-mono text-xs text-muted-foreground">
            {k}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <div className="overflow-hidden rounded bg-card/70">
              <div className="px-1.5 py-0.5 text-xs font-medium text-muted-foreground opacity-70">
                Before
              </div>
              <pre className="max-h-24 overflow-auto px-1.5 pb-1.5 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
                {fmt(before[k]).slice(0, 2000)}
              </pre>
            </div>
            <div className="overflow-hidden rounded border border-node-lore/30 bg-card/70">
              <div className="px-1.5 py-0.5 text-xs font-medium text-node-lore-fg opacity-80">
                After
              </div>
              <pre className="max-h-24 overflow-auto px-1.5 pb-1.5 text-xs leading-relaxed whitespace-pre-wrap">
                {fmt(after[k]).slice(0, 2000)}
              </pre>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
