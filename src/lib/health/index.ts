import type { Project, Spec, Task, Standard, Memory, Note, Agent, DevLog, Doc, Commit, Plan } from "../db/schema";
import { getDb } from "../db/schema";

export interface ProjectHealth {
  score: number;
  archScore: number;
  techDebt: number;
  velocity: number;
  openTasks: number;
  inProgress: number;
  done: number;
  specsByStatus: Record<string, number>;
  memoryCount: number;
  standardsEnforced: number;
  openPlans: number;
  notesCount: number;
  agentsActive: number;
  lastActivity: number;
  trend: "up" | "down" | "flat";
}

export async function computeHealth(project: Project): Promise<ProjectHealth> {
  const db = getDb();
  const [specs, tasks, standards, memories, notes, agents, logs, plans, commits, docs] = await Promise.all([
    db.specs.where("projectId").equals(project.id).toArray(),
    db.tasks.where("projectId").equals(project.id).toArray(),
    db.standards.where("projectId").equals(project.id).toArray(),
    db.memories.where("projectId").equals(project.id).toArray(),
    db.notes.where("projectId").equals(project.id).toArray(),
    db.agents.toArray(),
    db.devLogs.where("projectId").equals(project.id).toArray(),
    db.plans.toArray(),
    db.commits.where("projectId").equals(project.id).toArray(),
    db.docs.where("projectId").equals(project.id).toArray(),
  ]);
  const specsForProject = specs.filter((s) => s.projectId === project.id);
  const tasksForProject = tasks.filter((t) => t.projectId === project.id);

  const specsByStatus: Record<string, number> = {};
  for (const s of specsForProject) specsByStatus[s.status] = (specsByStatus[s.status] ?? 0) + 1;

  const open = tasksForProject.filter((t) => t.status !== "done").length;
  const inProg = tasksForProject.filter((t) => t.status === "in_progress").length;
  const done = tasksForProject.filter((t) => t.status === "done").length;
  const completedSpecs = specsByStatus["shipped"] ?? 0;
  const reviewing = specsByStatus["review"] ?? 0;
  const implementing = specsByStatus["implementing"] ?? 0;
  const total = specsForProject.length;

  const standardsEnforced = standards.filter((s) => s.enforced).length;
  const openPlans = plans.filter((p) => p.status === "awaiting_approval").length;

  const last7 = Date.now() - 7 * 24 * 3600_000;
  const last30 = Date.now() - 30 * 24 * 3600_000;
  const allEvents = [...logs.map((l) => ({ ts: l.createdAt })), ...commits.map((c) => ({ ts: c.date }))];
  const recentActivity = allEvents.filter((x) => x.ts > last7).length;
  const priorActivity = allEvents.filter((x) => x.ts > last30 && x.ts <= last7).length;
  const trend: "up" | "down" | "flat" = recentActivity > priorActivity ? "up" : recentActivity < priorActivity ? "down" : "flat";

  const specCompletion = total > 0 ? (completedSpecs + implementing * 0.5) / total : 0.5;
  const taskProgress = tasksForProject.length > 0 ? done / tasksForProject.length : 0.5;
  const velocity = recentActivity / 7;

  let score = 50;
  score += specCompletion * 25;
  score += taskProgress * 15;
  score += Math.min(velocity * 1.5, 10);
  score -= openPlans * 5;
  if (reviewing > 0) score += 2;
  score = Math.max(0, Math.min(100, Math.round(score)));

  const archScore = Math.max(0, Math.min(100, Math.round(
    50 +
      Math.min(standardsEnforced, 10) * 3 +
      (docs.length > 0 ? 8 : 0) +
      (notes.length > 5 ? 5 : 0) +
      (total > 0 ? 10 : 0) -
      (openPlans * 2),
  )));

  const techDebt = Math.max(0, Math.min(100, Math.round(
    30 +
      open * 1.5 +
      reviewing * 2 +
      (standardsEnforced < 5 ? 10 : 0) -
      done * 1.2 -
      Math.min(memories.length, 8),
  )));

  return {
    score,
    archScore,
    techDebt,
    velocity,
    openTasks: open,
    inProgress: inProg,
    done,
    specsByStatus,
    memoryCount: memories.length,
    standardsEnforced,
    openPlans,
    notesCount: notes.length,
    agentsActive: agents.filter((a) => a.status !== "idle").length,
    lastActivity: Math.max(...logs.map((l) => l.createdAt), ...commits.map((c) => c.date), 0),
    trend,
  };
}

export async function listCommitsForProject(projectId: string, limit = 10) {
  const db = getDb();
  const all = await db.commits.where("projectId").equals(projectId).toArray();
  return all.sort((a, b) => b.date - a.date).slice(0, limit);
}

export async function listRecentActivity(projectId: string, limit = 12) {
  const db = getDb();
  const [logs, commits] = await Promise.all([
    db.devLogs.where("projectId").equals(projectId).toArray(),
    db.commits.where("projectId").equals(projectId).toArray(),
  ]);
  type Activity =
    | { kind: "log"; id: string; title: string; ts: number; subtitle?: string; body?: string }
    | { kind: "commit"; id: string; title: string; ts: number; hash?: string; author?: string; files?: string[]; aiSummary?: string | null };
  const list: Activity[] = [
    ...logs.map((l) => ({ kind: "log" as const, id: l.id, title: l.title, ts: l.createdAt, subtitle: l.kind, body: l.body })),
    ...commits.map((c) => ({ kind: "commit" as const, id: c.id, title: c.message, ts: c.date, hash: c.hash, author: c.author, files: c.files, aiSummary: c.aiSummary })),
  ];
  return list.sort((a, b) => b.ts - a.ts).slice(0, limit);
}
