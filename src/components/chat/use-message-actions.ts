import { noteFromText, taskFromText } from "@/lib/entities/send-to";
import { notesRepo, tasksRepo } from "@/lib/db/repos";
import { openEntity } from "@/lib/entities/open";

export interface MessageActions {
  saveCodeAsNote: (code: string, language: string) => Promise<void>;
  sendToTask: (text: string) => Promise<void>;
  sendToNote: (text: string) => Promise<void>;
}

/** Per-message actions that hand a reply to another part of the workspace. */
export function useMessageActions(projectId: string | null): MessageActions {
  /** Save a fenced code block from an assistant reply as a brain note. */
  async function saveCodeAsNote(code: string, language: string) {
    if (!projectId) return;
    const firstLine = code.split("\n").find((l) => l.trim()) ?? "snippet";
    const title =
      firstLine.replace(/^[#/\s*-]+/, "").slice(0, 60) || "Code snippet";
    await notesRepo.create({
      projectId,
      title,
      body: `\`\`\`${language}\n${code}\n\`\`\``,
      type: "note",
    });
  }

  /** Send a message's text to the Task Boards as a new task (opens it). */
  async function sendToTask(text: string) {
    if (!projectId) return;
    const task = await tasksRepo.create({ projectId, ...taskFromText(text) });
    openEntity({ kind: "task", id: task.id });
  }

  /** Send a message's text to the Brain as a new note (opens it). */
  async function sendToNote(text: string) {
    if (!projectId) return;
    const note = await notesRepo.create({ projectId, ...noteFromText(text) });
    openEntity({ kind: "note", id: note.id });
  }

  return { saveCodeAsNote, sendToTask, sendToNote };
}
