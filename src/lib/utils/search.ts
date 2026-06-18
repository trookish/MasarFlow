import Fuse from "fuse.js";
import {
  notesRepo,
  specsRepo,
  tasksRepo,
  standardsRepo,
  memoriesRepo,
  devLogsRepo,
} from "@/lib/db/repos";
import { stripMarkdown } from "./markdown";

export type SearchKind =
  | "note"
  | "spec"
  | "task"
  | "standard"
  | "memory"
  | "devlog";

export interface SearchItem {
  id: string;
  kind: SearchKind;
  title: string;
  subtitle: string;
  body: string;
  href: string;
}

const KIND_LABEL: Record<SearchKind, string> = {
  note: "Note",
  spec: "Spec",
  task: "Task",
  standard: "Standard",
  memory: "Memory",
  devlog: "Dev Log",
};

export function kindLabel(kind: SearchKind): string {
  return KIND_LABEL[kind];
}

/** Load and flatten every searchable record for a project into SearchItems. */
export async function buildSearchItems(
  projectId?: string | null,
): Promise<SearchItem[]> {
  if (!projectId) return [];
  const [notes, specs, tasks, standards, memories, devLogs] = await Promise.all(
    [
      notesRepo.listByProject(projectId),
      specsRepo.listByProject(projectId),
      tasksRepo.listByProject(projectId),
      standardsRepo.listByProject(projectId),
      memoriesRepo.listByProject(projectId),
      devLogsRepo.listByProject(projectId),
    ],
  );

  const items: SearchItem[] = [];

  for (const n of notes) {
    items.push({
      id: n.id,
      kind: "note",
      title: n.title,
      subtitle: `${n.type} · ${n.tags.join(", ")}`,
      body: stripMarkdown(n.body),
      href: `/brain?note=${n.id}`,
    });
  }
  for (const s of specs) {
    items.push({
      id: s.id,
      kind: "spec",
      title: `${s.number} · ${s.title}`,
      subtitle: `${s.status} · ${s.purpose}`,
      body: s.technicalNotes,
      href: `/specs?spec=${s.id}`,
    });
  }
  for (const t of tasks) {
    items.push({
      id: t.id,
      kind: "task",
      title: t.title,
      subtitle: `${t.status} · ${t.priority} · ${t.assignee}`,
      body: t.description,
      href: `/tasks?task=${t.id}`,
    });
  }
  for (const s of standards) {
    items.push({
      id: s.id,
      kind: "standard",
      title: s.title,
      subtitle: `${s.category}`,
      body: s.rule,
      href: `/standards?standard=${s.id}`,
    });
  }
  for (const m of memories) {
    items.push({
      id: m.id,
      kind: "memory",
      title: m.content,
      subtitle: `${m.type} · weight ${m.weight}`,
      body: m.tags.join(", "),
      href: `/dashboard`,
    });
  }
  for (const d of devLogs) {
    items.push({
      id: d.id,
      kind: "devlog",
      title: d.title,
      subtitle: d.type,
      body: stripMarkdown(d.body),
      href: `/devlogs`,
    });
  }

  return items;
}

/** Construct a Fuse index over search items. */
export function createSearchIndex(items: SearchItem[]): Fuse<SearchItem> {
  return new Fuse(items, {
    keys: [
      { name: "title", weight: 0.6 },
      { name: "subtitle", weight: 0.25 },
      { name: "body", weight: 0.15 },
    ],
    threshold: 0.4,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });
}
