import Fuse from "fuse.js";
import type { Doc, Note, Spec, Task } from "@/lib/db/schema";
import { docsRepo, notesRepo, specsRepo, tasksRepo } from "@/lib/db/repos";
import { entityHref } from "@/lib/entities/registry"; // P5.T1
import type { MirrorKind } from "./paths";

/** The Ctrl/Cmd+O palette: everything the vault mirrors, searchable. */

export const KIND_LABEL: Record<MirrorKind, string> = {
  note: "Note",
  doc: "Doc",
  spec: "Spec",
  task: "Task",
};

export interface QuickItem {
  kind: MirrorKind;
  id: string;
  title: string;
  subtitle: string;
  href: string;
  updatedAt: number;
}

function makeItem(
  kind: MirrorKind,
  row: { id: string; title: string; updatedAt: number },
  badge: string | undefined,
  tags: string[],
): QuickItem {
  return {
    kind,
    id: row.id,
    title: row.title || "untitled",
    subtitle: [KIND_LABEL[kind], badge, tags.slice(0, 3).join(" ")].filter(Boolean).join(" · "),
    href: entityHref({ kind, id: row.id }),
    updatedAt: row.updatedAt,
  };
}

export function buildQuickItems(input: { notes: Note[]; docs: Doc[]; specs: Spec[]; tasks: Task[] }): QuickItem[] {
  return [
    ...input.notes.map((n) => makeItem("note", n, n.type, n.tags)),
    ...input.docs.map((d) => makeItem("doc", d, d.category, [])),
    ...input.specs.map((s) => makeItem("spec", s, s.status, [])),
    ...input.tasks.map((t) => makeItem("task", t, t.status, t.tags)),
  ].sort((a, b) => b.updatedAt - a.updatedAt || a.title.localeCompare(b.title));
}

export function rankQuickItems(items: QuickItem[], query: string, limit = 12): QuickItem[] {
  const q = query.trim();
  if (!q) return items.slice(0, limit);
  const fuse = new Fuse(items, {
    keys: ["title", "subtitle"],
    threshold: 0.35,
    ignoreLocation: true,
  });
  return fuse.search(q, { limit }).map((r) => r.item);
}

export async function loadQuickItems(projectId: string): Promise<QuickItem[]> {
  const [notes, docs, specs, tasks] = await Promise.all([
    notesRepo.listByProject(projectId),
    docsRepo.listByProject(projectId),
    specsRepo.listByProject(projectId),
    tasksRepo.listByProject(projectId),
  ]);
  return buildQuickItems({ notes, docs, specs, tasks });
}
