"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { KIND_META, type EntityRef } from "@/lib/entities/registry";
import { titleOfEntity } from "@/lib/entities/resolve";
import { openEntity } from "@/lib/entities/open";
import { cn } from "@/lib/utils/cn";

/** Clickable reference to any entity. Title is live; a deleted entity renders struck-through. */
export function EntityChip({
  entity,
  className,
}: {
  entity: EntityRef;
  className?: string;
}) {
  const title = useLiveQuery(
    () => titleOfEntity(entity),
    [entity.kind, entity.id],
  );
  const meta = KIND_META[entity.kind];
  const missing = title === null;
  return (
    <button
      type="button"
      title={missing ? `${meta.label} no longer exists` : `Open ${meta.label}`}
      disabled={missing}
      onClick={() => openEntity(entity)}
      className={cn(
        "inline-flex max-w-full cursor-pointer items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 align-baseline text-xs font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    >
      <span className="text-muted-foreground">{meta.label}</span>
      <span className={cn("truncate", missing && "line-through")}>
        {title === undefined ? "…" : (title ?? entity.id)}
      </span>
    </button>
  );
}
