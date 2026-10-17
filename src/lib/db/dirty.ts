import type { MasarFlowDB } from "@/lib/db";

/** Tables whose churn must not trigger a backup. */
const IGNORED = new Set(["embeddings", "watchEvents", "parsedContents"]);

let dirty = 0;

/** Returns and resets the number of user-data writes since the last call. */
export function takeDirty(): number {
  const n = dirty;
  dirty = 0;
  return n;
}

/** Subscribe to Dexie table hooks. (P5's activity log is a separate subscriber: src/lib/activity/track.ts.) */
export function installDirtyTracking(db: MasarFlowDB): () => void {
  const bump = (): void => {
    dirty++;
  };
  const offs: Array<() => void> = [];
  for (const table of db.tables) {
    if (IGNORED.has(table.name)) continue;
    table.hook("creating", bump);
    table.hook("updating", bump);
    table.hook("deleting", bump);
    offs.push(() => {
      table.hook("creating").unsubscribe(bump);
      table.hook("updating").unsubscribe(bump);
      table.hook("deleting").unsubscribe(bump);
    });
  }
  return () => offs.forEach((f) => f());
}
