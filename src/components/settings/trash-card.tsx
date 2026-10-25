"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { RotateCcw, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { emptyTrash, purgeTrash, restoreEntity } from "@/lib/domain/commands";
import { useActiveProject } from "@/lib/hooks/use-project";
import { Button } from "@/components/ui/button";

const KIND_LABEL: Record<string, string> = { task: "Task", spec: "Specification", doc: "Document", note: "Note" };

/** Removed items of the active project. Restoring puts back the item and every reference that still applies. */
export function TrashCard() {
  const project = useActiveProject();
  const projectId = project?.id ?? null;
  const entries = useLiveQuery(
    async () =>
      projectId ? (await db.trash.where("projectId").equals(projectId).toArray()).sort((a, b) => b.deletedAt - a.deletedAt) : [],
    [projectId],
  );
  const [message, setMessage] = useState<string | null>(null);
  if (!projectId) return null;
  const list = entries ?? [];

  return (
    <section className="rounded-lg border border-border bg-card p-4" aria-labelledby="trash-title">
      <div className="flex items-center justify-between">
        <h3 id="trash-title" className="text-sm font-semibold">
          Trash
        </h3>
        <Button
          size="sm"
          variant="outline"
          disabled={list.length === 0}
          onClick={async () => {
            if (!window.confirm(`Permanently delete ${list.length} item(s) from the trash?`)) return;
            const n = await emptyTrash(projectId);
            setMessage(`${n} item(s) permanently deleted.`);
          }}
        >
          Empty trash
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Removed tasks, specifications, documents and notes of this project. Restoring an item also restores its links
        and references where the other side still exists.
      </p>
      <ul className="mt-3 divide-y divide-border text-xs" aria-label="Trash items">
        {list.length === 0 ? <li className="py-2 text-muted-foreground">The trash is empty.</li> : null}
        {list.map((e) => (
          <li key={e.id} className="flex items-center justify-between gap-3 py-2">
            <span className="min-w-0 truncate">
              <span className="text-muted-foreground">{KIND_LABEL[e.kind] ?? e.kind}</span> · {e.title || "Untitled"}
              <span className="ml-2 text-muted-foreground">{new Date(e.deletedAt).toLocaleString()}</span>
            </span>
            <span className="flex shrink-0 gap-1">
              <Button
                size="sm"
                variant="outline"
                aria-label={`Restore ${e.title}`}
                onClick={async () => {
                  await restoreEntity(e.id);
                  setMessage(`Restored “${e.title}”.`);
                }}
              >
                <RotateCcw className="mr-1.5 size-3.5" /> Restore
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Delete ${e.title} permanently`}
                onClick={async () => {
                  await purgeTrash(e.id);
                  setMessage(`“${e.title}” permanently deleted.`);
                }}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </span>
          </li>
        ))}
      </ul>
      {message ? (
        <p className="mt-2 text-xs text-muted-foreground" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
