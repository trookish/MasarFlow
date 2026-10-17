import type { Note, PropValue } from "@/lib/db/schema";
import { notesRepo } from "@/lib/db/repos/notes";
import { openEntity } from "@/lib/entities/open"; // P5.T5
import { dayOfNote, isMirroredPath } from "./paths";

/**
 * Daily notes: one dated note per local day, mirrored to `daily/<YYYY-MM-DD>.md`.
 *
 * P8 CONTRACT — the Today view imports exactly this:
 *   const { noteId } = await openDailyNote(projectId);   // ensures + focuses
 * P8 must not create its own daily note; it calls openDailyNote so the day,
 * the tags, the `day` property and the file path stay in one place.
 */

export const DAILY_TAG = "daily";

/** `YYYY-MM-DD` in the user's local timezone (a day is a local thing). */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export const dailyTitle = (day: string): string => day;

/** The file the day maps to (guarded in paths.ts). */
export function dailyPathKey(day: string): string {
  return `daily/${day}.md`;
}

export function dailyNoteProps(day: string): Record<string, PropValue> {
  return { day };
}

export function findDailyNote(notes: Note[], day: string): Note | null {
  return notes.find((n) => dayOfNote(n) === day) ?? null;
}

/** Today's note, created on first use. Never duplicates a day. */
export async function ensureDailyNote(projectId: string, day = dayKey(new Date())): Promise<Note> {
  const existing = findDailyNote(await notesRepo.listByProject(projectId), day);
  if (existing) return existing;
  const created = await notesRepo.create({
    projectId,
    title: dailyTitle(day),
    body: "",
    tags: [DAILY_TAG],
    props: dailyNoteProps(day),
  });
  return created;
}

/** Ensure + focus. The one entry point P8's Today view and the palette use. */
export async function openDailyNote(projectId: string, date = new Date()): Promise<{ noteId: string }> {
  const note = await ensureDailyNote(projectId, dayKey(date));
  await openEntity({ kind: "note", id: note.id });
  return { noteId: note.id };
}

/** True when a mirrored path is a daily note file. */
export const isDailyPath = (rel: string): boolean => /^daily\/\d{4}-\d{2}-\d{2}\.md$/.test(rel);

export { isMirroredPath };
