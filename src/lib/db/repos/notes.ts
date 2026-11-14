import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "../schema";
import type { Note, NoteTemplate } from "../schema";

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

export function useNoteTemplates(projectId: string | undefined) {
  return useLiveQuery(
    () =>
      projectId
        ? getDb().noteTemplates.where("projectId").equals(projectId).sortBy("name")
        : Promise.resolve([] as NoteTemplate[]),
    [projectId],
    [] as NoteTemplate[],
  );
}

export function useNoteTemplate(id: string | undefined) {
  return useLiveQuery(() => (id ? getDb().noteTemplates.get(id) : undefined), [id]);
}

export function useDefaultNoteTemplate(projectId: string | undefined, type: string | undefined) {
  return useLiveQuery(
    () =>
      projectId && type
        ? getDb()
            .noteTemplates.where({ projectId, type })
            .and((t) => t.isDefault)
            .first()
        : Promise.resolve(undefined),
    [projectId, type],
  );
}

export async function upsertNoteTemplate(template: NoteTemplate): Promise<void> {
  await getDb().noteTemplates.put(template);
}

export async function deleteNoteTemplate(id: string): Promise<void> {
  await getDb().noteTemplates.delete(id);
}
