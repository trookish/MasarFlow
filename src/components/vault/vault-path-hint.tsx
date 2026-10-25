"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useActiveProjectId } from "@/lib/hooks/use-project";
import { useVaultStore } from "@/lib/stores/vault";

/**
 * "This entity's file" — the live mapping from the sync index.
 *
 * `syncFiles.entityId` is not a Dexie index (the table only indexes
 * id/projectId/path/status), so the lookup narrows by the indexed projectId
 * first and filters the rest in memory.
 */
export function VaultPathHint({ entityId }: { entityId: string }) {
  const projectId = useActiveProjectId();
  const root = useVaultStore((s) => (projectId ? s.byProject[projectId]?.root ?? "" : ""));
  const folder = useVaultStore((s) => (projectId ? s.byProject[projectId]?.folder ?? "" : ""));
  const row = useLiveQuery(
    async () => {
      if (!projectId) return undefined;
      const rows = await db.syncFiles
        .where("[projectId+adapter]")
        .equals([projectId, "folder"])
        .filter((r) => r.entityId === entityId)
        .toArray();
      return rows[0];
    },
    [projectId, entityId],
  );
  if (!root || !folder || !row) return null;
  return (
    <p className="pt-1 text-[10px] text-muted-foreground">
      File: <span className="font-mono">{root}/{folder}/{row.path}</span> · {row.status}
    </p>
  );
}
