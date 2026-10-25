import type { Table } from "dexie";
import { db } from "@/lib/db";
import { uuid, now } from "@/lib/utils/ids";
import type { Actor, DomainEvent } from "../events";

export interface CommandTx {
  actor: Actor;
  at: number;
  emit(e: Omit<DomainEvent, "id" | "at" | "actor">): void;
}

/**
 * Run one domain command in a single read-write transaction over `tables` plus the event feed.
 * Events emitted by `fn` are written at the end of the same transaction, so the feed never
 * disagrees with the data: a throw rolls back both.
 *
 * Do not await anything outside IndexedDB inside `fn` (secret store, network, IPC): Dexie commits
 * the transaction as soon as it sees a foreign promise, and the next write fails with
 * TransactionInactiveError. Hydrate secrets and fetch data before calling.
 */
export async function runCommand<T>(
  tables: Table[],
  actor: Actor,
  fn: (tx: CommandTx) => Promise<T>,
): Promise<T> {
  const unique = [...new Set([...tables, db.events])];
  return db.transaction("rw", unique, async () => {
    const pending: DomainEvent[] = [];
    const at = now();
    const tx: CommandTx = {
      actor,
      at,
      emit: (e) => pending.push({ ...e, id: uuid(), at, actor }),
    };
    const out = await fn(tx);
    if (pending.length) await db.events.bulkAdd(pending);
    return out;
  });
}

