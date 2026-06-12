import type { Task } from "../db/schema";
import { parseFrontmatter, stripFrontmatter, extractTitleFromBody, serializeFrontmatter } from "./frontmatter";

export interface VaultTaskInput {
  projectId: string;
  body: string;
  relativePath: string;
  mtime: number;
  defaultStatus?: Task["status"];
}

export interface VaultTaskOutput {
  task: Task;
  isTask: boolean;
}

const STATUS_MAP: Record<string, Task["status"]> = {
  backlog: "backlog",
  todo: "todo",
  "to do": "todo",
  doing: "in_progress",
  "in-progress": "in_progress",
  "in progress": "in_progress",
  review: "review",
  "in-review": "review",
  done: "done",
  complete: "done",
  completed: "done",
  cancelled: "done",
  canceled: "done",
};

function normalizeStatus(s: string | null | undefined): Task["status"] {
  if (!s) return "backlog";
  const k = s.toLowerCase().trim();
  return STATUS_MAP[k] ?? "backlog";
}

function normalizePriority(p: string | null | undefined): Task["priority"] {
  if (!p) return "medium";
  const k = p.toLowerCase().trim();
  if (k === "urgent" || k === "critical" || k === "p0") return "urgent";
  if (k === "high" || k === "p1") return "high";
  if (k === "low" || k === "p3") return "low";
  return "medium";
}

export function isTaskNote(body: string): boolean {
  if (!body.includes("---")) return false;
  const fm = parseFrontmatter(body);
  return !!fm.status;
}

export function vaultTaskToBrain(input: VaultTaskInput): VaultTaskOutput {
  const fm = parseFrontmatter(input.body);
  const body = stripFrontmatter(input.body);
  const filename = input.relativePath.split("/").pop() ?? "";
  const baseTitle = filename.replace(/\.md$/i, "");
  const title = (fm.raw.title as string) ?? extractTitleFromBody(body, baseTitle);
  const status = fm.status ? normalizeStatus(fm.status) : input.defaultStatus ?? "backlog";
  const priority = fm.priority ? normalizePriority(fm.priority) : "medium";
  const completed = !!fm.completedDate || status === "done";
  const id = "task_" + input.projectId + "_" + baseTitle.replace(/\s+/g, "_").toLowerCase();
  const task: Task = {
    id,
    projectId: input.projectId,
    title,
    description: body.trim(),
    status: completed ? "done" : status,
    priority,
    specId: null,
    parentTaskId: null,
    assignee: "human",
    dependencies: [],
    progress: completed ? 100 : 0,
    tags: fm.tags ?? [],
    createdAt: fm.dateCreated ?? input.mtime,
    updatedAt: fm.dateModified ?? input.mtime,
  };
  return { task, isTask: true };
}

export function brainTaskToVault(task: Task): string {
  const fm = parseFrontmatter("");
  fm.status = task.status;
  fm.priority = task.priority;
  if (task.tags.length) fm.tags = task.tags;
  (fm.raw as Record<string, unknown>).title = task.title;
  if (task.status === "done") {
    fm.completedDate = task.updatedAt;
  } else {
    fm.scheduled = task.createdAt;
  }
  fm.dateCreated = task.createdAt;
  fm.dateModified = task.updatedAt;
  const header = serializeFrontmatter(fm).trimEnd();
  const body = (task.description ?? "").trim();
  if (body) return header + String.fromCharCode(10) + String.fromCharCode(10) + "# " + task.title + String.fromCharCode(10) + String.fromCharCode(10) + body + String.fromCharCode(10);
  return header + String.fromCharCode(10) + String.fromCharCode(10) + "# " + task.title + String.fromCharCode(10);
}
