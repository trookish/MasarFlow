import { db } from "@/lib/db";
import type { NoteTemplate, NoteType } from "@/lib/db/schema";
import { uuid, now } from "@/lib/utils/ids";

interface CreateTemplateInput {
  projectId: string;
  name: string;
  description?: string;
  type?: NoteType;
  body?: string;
  tags?: string[];
  id?: string;
}

export const noteTemplatesRepo = {
  async listByProject(projectId?: string | null): Promise<NoteTemplate[]> {
    if (!projectId) return [];
    return db.noteTemplates.where("projectId").equals(projectId).toArray();
  },

  get(id: string): Promise<NoteTemplate | undefined> {
    return db.noteTemplates.get(id);
  },

  async create(input: CreateTemplateInput): Promise<NoteTemplate> {
    const ts = now();
    const template: NoteTemplate = {
      id: input.id ?? uuid(),
      projectId: input.projectId,
      name: input.name,
      description: input.description ?? "",
      type: input.type ?? "note",
      body: input.body ?? "",
      tags: input.tags ?? [],
      createdAt: ts,
      updatedAt: ts,
    };
    await db.noteTemplates.add(template);
    return template;
  },

  async update(id: string, patch: Partial<NoteTemplate>): Promise<void> {
    await db.noteTemplates.update(id, { ...patch, updatedAt: now() });
  },

  async remove(id: string): Promise<void> {
    await db.noteTemplates.delete(id);
  },
};
