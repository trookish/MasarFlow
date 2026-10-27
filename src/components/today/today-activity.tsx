"use client";

/**
 * Recent activity (P5 activity table). Renders the same EntityChips the rest
 * of the app uses, so a row here is the same object as a row in a backlinks
 * section — one entity language, no parallel link format.
 */

import { Activity as ActivityIcon } from "lucide-react";
import { activityRepo } from "@/lib/db/repos/activity";
import type { Activity } from "@/lib/db/schema";
import { EntityChip } from "@/components/entities/entity-chip";
import { useLiveQuery } from "dexie-react-hooks";
import { formatRelativeTime } from "@/lib/utils/relative-time";

export function TodayActivity({ projectId }: { projectId: string }) {
  const rows =
    useLiveQuery(() => activityRepo.listRecent(projectId, 15), [projectId], undefined) ?? [];

  return (
    <section aria-label="Recent activity" className="rounded-lg border border-border bg-card">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <ActivityIcon className="h-3.5 w-3.5 text-muted-foreground" />
        <h3 className="text-sm font-medium">Recent activity</h3>
        <p className="ml-auto text-xs text-muted-foreground">Last 15 changes</p>
      </header>
      {rows.length === 0 ? (
        <p className="px-3 py-4 text-xs text-muted-foreground">
          Nothing yet today. Create a task or a note and it appears here.
        </p>
      ) : (
        <ul className="divide-y divide-border/60">
          {rows.map((row: Activity) => (
            <li key={row.id} className="flex items-center gap-2 px-3 py-2 text-xs">
              <span className="min-w-0 flex-1 truncate">{row.summary}</span>
              <EntityChip entity={{ kind: row.entityKind, id: row.entityId }} />
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatRelativeTime(row.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
