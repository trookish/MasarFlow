"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { linksRepo } from "@/lib/db/repos";
import { computeBacklinks } from "@/lib/entities/backlinks";
import type { EntityRef } from "@/lib/entities/registry";
import { EntityChip } from "./entity-chip";

/** "Linked from" / "Links to" for any entity, live. Renders nothing when there are no links. */
export function BacklinksSection({ projectId, entity }: { projectId: string; entity: EntityRef }) {
  const links = useLiveQuery(
    () => linksRepo.listByProject(projectId),
    [projectId],
  );
  if (!links) return null;
  const { incoming, outgoing } = computeBacklinks(links, entity);
  if (incoming.length === 0 && outgoing.length === 0) return null;
  const group = (title: string, edges: typeof incoming) =>
    edges.length === 0 ? null : (
      <div className="space-y-1">
        <div className="text-xs font-medium text-muted-foreground">{title}</div>
        <div className="flex flex-wrap gap-1.5">
          {edges.map((e) => (
            <EntityChip key={e.linkId} entity={e.other} />
          ))}
        </div>
      </div>
    );
  return (
    <section aria-label="Connections" className="mt-6 space-y-3 border-t border-border pt-4">
      {group(`Linked from (${incoming.length})`, incoming)}
      {group(`Links to (${outgoing.length})`, outgoing)}
    </section>
  );
}
