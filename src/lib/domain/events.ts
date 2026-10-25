import type { EntityKind } from "@/lib/db/schema";

/** Who caused a write. P3 replicas use "replica", P4 tools use "ai". */
export type Actor = "user" | "ai" | "import" | "replica";
export type EventOp = "create" | "update" | "remove" | "restore" | "purge";

/** One entry of the domain event feed, written in the same transaction as the change it describes. */
export interface DomainEvent {
  id: string;
  projectId: string;
  at: number;
  entityKind: EntityKind | "project";
  entityId: string;
  op: EventOp;
  actor: Actor;
  patch?: Record<string, unknown>;
}

/** A field change applied by a cascade, kept so restore can put it back. */
export interface FieldEdit {
  table: string;
  id: string;
  field: string;
  /** Value before the cascade changed it. */
  before: unknown;
}

/**
 * A removed entity. The row leaves its table (so every reader stays correct without a filter) and
 * lands here with the links and field edits needed to restore it. `id` is `<kind>:<entityId>`.
 */
export interface TrashEntry {
  id: string;
  projectId: string;
  kind: EntityKind;
  entityId: string;
  title: string;
  deletedAt: number;
  actor: Actor;
  row: Record<string, unknown>;
  links: Array<Record<string, unknown>>;
  edits: FieldEdit[];
}

export const trashId = (kind: EntityKind, id: string) => `${kind}:${id}`;
