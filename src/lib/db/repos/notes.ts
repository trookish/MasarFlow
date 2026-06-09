import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "../schema";
import type { Note } from "../schema";

export function useNotes(projectId: string | undefined) {
  return useLiveQuery(
    () =>
      projectId
        ? getDb().notes.where("projectId").equals(projectId).reverse().sortBy("updatedAt")
        : Promise.resolve([] as Note[]),
    [projectId],
    [] as Note[],
  );
}

export function useNote(id: string | undefined) {
  return useLiveQuery(() => (id ? getDb().notes.get(id) : undefined), [id]);
}

export async function upsertNote(note: Note): Promise<void> {
  await getDb().notes.put(note);
}
