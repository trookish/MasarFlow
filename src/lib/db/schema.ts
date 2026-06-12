import Dexie, { type Table } from "dexie";
import { z } from "zod";

export const idSchema = z.string().min(1);

export const projectSchema = z.object({
  id: idSchema,
  name: z.string(),
  slug: z.string(),
  description: z.string().default(""),
  health: z.number().min(0).max(100).default(80),
  archScore: z.number().min(0).max(100).default(75),
  techDebt: z.number().min(0).max(100).default(20),
  createdAt: z.number(),
  updatedAt: z.number(),
  accent: z.string().default("violet"),
});
export type Project = z.infer<typeof projectSchema>;

export const NOTE_TYPES = [
  "idea",
  "system",
  "mechanic",
  "research",
  "experiment",
  "note",
  "lore",
  "decision",
] as const;
export type NoteType = (typeof NOTE_TYPES)[number];

export const noteSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  type: z.enum(NOTE_TYPES),
  title: z.string(),
  body: z.string().default(""),
  excerpt: z.string().default(""),
  tags: z.array(z.string()).default([]),
  folderId: z.string().nullable().default(null),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Note = z.infer<typeof noteSchema>;

export const SPEC_STATUS = ["draft", "review", "approved", "implementing", "shipped"] as const;
export type SpecStatus = (typeof SPEC_STATUS)[number];

export const specSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  number: z.string(),
  title: z.string(),
  status: z.enum(SPEC_STATUS),
  purpose: z.string().default(""),
  goals: z.array(z.string()).default([]),
  features: z.array(z.string()).default([]),
  constraints: z.array(z.string()).default([]),
  dependencies: z.array(z.string()).default([]),
  acceptance: z.array(z.string()).default([]),
  technicalNotes: z.string().default(""),
  risks: z.array(z.string()).default([]),
  futureImprovements: z.array(z.string()).default([]),
  implementationProgress: z.number().min(0).max(100).default(0),
  linkedNoteIds: z.array(z.string()).default([]),
  linkedTaskIds: z.array(z.string()).default([]),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Spec = z.infer<typeof specSchema>;

export const STANDARD_CATEGORIES = [
  "naming",
  "structure",
  "comments",
  "patterns",
  "performance",
  "events",
  "di",
  "files",
  "unity",
  "networking",
  "other",
] as const;
export type StandardCategory = (typeof STANDARD_CATEGORIES)[number];

export const standardSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  category: z.enum(STANDARD_CATEGORIES),
  title: z.string(),
  rule: z.string(),
  examples: z.array(z.string()).default([]),
  enforced: z.boolean().default(true),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Standard = z.infer<typeof standardSchema>;

export const TASK_STATUS = ["backlog", "todo", "in_progress", "review", "done"] as const;
export type TaskStatus = (typeof TASK_STATUS)[number];
export const TASK_PRIORITY = ["low", "medium", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITY)[number];

export const taskSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  title: z.string(),
  description: z.string().default(""),
  status: z.enum(TASK_STATUS),
  priority: z.enum(TASK_PRIORITY),
  specId: z.string().nullable().default(null),
  parentTaskId: z.string().nullable().default(null),
  assignee: z.enum(["human", "ai", "architect", "programmer", "reviewer", "tester", "documenter", "designer", "optimizer"]),
  dependencies: z.array(z.string()).default([]),
  progress: z.number().min(0).max(100).default(0),
  tags: z.array(z.string()).default([]),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Task = z.infer<typeof taskSchema>;

export const systemSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  name: z.string(),
  kind: z.string(),
  description: z.string().default(""),
  dependsOn: z.array(z.string()).default([]),
  exposes: z.array(z.string()).default([]),
});
export type System = z.infer<typeof systemSchema>;

export const archNodeSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  systemId: idSchema.nullable(),
  type: z.enum(["service", "class", "scene", "prefab", "module", "script", "so"]),
  name: z.string(),
});
export type ArchNode = z.infer<typeof archNodeSchema>;

export const archEdgeSchema = z.object({
  id: idSchema,
  source: idSchema,
  target: idSchema,
  kind: z.enum(["depends", "calls", "instantiates", "flows-into", "references"]),
});
export type ArchEdge = z.infer<typeof archEdgeSchema>;

export const docSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  kind: z.enum(["system", "api", "arch", "tutorial", "guide"]),
  title: z.string(),
  body: z.string().default(""),
  generatedFrom: z.string().nullable().default(null),
  updatedAt: z.number(),
});
export type Doc = z.infer<typeof docSchema>;

export const DEVLOG_KINDS = [
  "feature",
  "refactor",
  "decision",
  "discussion",
  "lesson",
  "failure",
  "success",
  "milestone",
] as const;
export type DevLogKind = (typeof DEVLOG_KINDS)[number];

export const devLogSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  kind: z.enum(DEVLOG_KINDS),
  title: z.string(),
  body: z.string().default(""),
  refs: z.array(z.object({ type: z.string(), id: z.string() })).default([]),
  createdAt: z.number(),
});
export type DevLog = z.infer<typeof devLogSchema>;

export const AGENT_ROLES = [
  "architect",
  "planner",
  "programmer",
  "reviewer",
  "optimizer",
  "tester",
  "documenter",
  "designer",
] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

export const agentSchema = z.object({
  id: idSchema,
  name: z.string(),
  role: z.enum(AGENT_ROLES),
  persona: z.string(),
  description: z.string(),
  status: z.enum(["idle", "thinking", "acting", "waiting", "error"]),
  capabilities: z.array(z.string()).default([]),
  lastRunAt: z.number().nullable().default(null),
});
export type Agent = z.infer<typeof agentSchema>;

export const commitSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  hash: z.string(),
  message: z.string(),
  author: z.string(),
  date: z.number(),
  files: z.array(z.string()).default([]),
  aiSummary: z.string().nullable().default(null),
});
export type Commit = z.infer<typeof commitSchema>;

export const memorySchema = z.object({
  id: idSchema,
  projectId: idSchema,
  kind: z.enum(["pattern", "decision", "lesson", "preference", "fact"]),
  content: z.string(),
  tags: z.array(z.string()).default([]),
  weight: z.number().min(0).max(1).default(0.5),
  createdAt: z.number(),
  lastRecallAt: z.number().nullable().default(null),
});
export type Memory = z.infer<typeof memorySchema>;

export const linkSchema = z.object({
  id: idSchema,
  sourceType: z.string(),
  sourceId: idSchema,
  targetType: z.string(),
  targetId: idSchema,
  kind: z.string().default("references"),
});
export type Link = z.infer<typeof linkSchema>;

export const tagSchema = z.object({
  id: idSchema,
  name: z.string(),
  color: z.string(),
});
export type Tag = z.infer<typeof tagSchema>;

export const folderSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  parentId: z.string().nullable().default(null),
  name: z.string(),
  icon: z.string().nullable().default(null),
});
export type Folder = z.infer<typeof folderSchema>;

export const planSchema = z.object({
  id: idSchema,
  specId: idSchema,
  summary: z.string(),
  affectedSystems: z.array(z.string()).default([]),
  conflicts: z.array(z.string()).default([]),
  archImpact: z.string().default(""),
  alternatives: z.array(z.string()).default([]),
  complexity: z.enum(["low", "medium", "high", "epic"]),
  risks: z.array(z.string()).default([]),
  roadmap: z.array(z.string()).default([]),
  status: z.enum(["draft", "awaiting_approval", "approved", "rejected"]),
  createdAt: z.number(),
});
export type Plan = z.infer<typeof planSchema>;

export const syncFileSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  relativePath: z.string(),
  side: z.enum(["remote", "local", "both"]),
  status: z.enum(["synced", "local-newer", "remote-newer", "conflict", "deleted-local", "deleted-remote", "ignored", "trash"]),
  mtime: z.number(),
  hash: z.string(),
  noteId: z.string().nullable().default(null),
  taskId: z.string().nullable().default(null),
  lastSyncedAt: z.number(),
  isTemplate: z.boolean().default(false),
  inTrash: z.boolean().default(false),
  size: z.number().default(0),
});
export type SyncFile = z.infer<typeof syncFileSchema>;

export const vaultMetaSchema = z.object({
  key: idSchema,
  value: z.unknown(),
});
export type VaultMeta = z.infer<typeof vaultMetaSchema>;

export const attachmentSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  relativePath: z.string(),
  mimeType: z.string(),
  size: z.number(),
  blob: z.instanceof(Blob).optional(),
  cachedAt: z.number(),
  sourceVaultPath: z.string().nullable().default(null),
});
export type Attachment = z.infer<typeof attachmentSchema>;

export interface MasarFlowDB extends Dexie {
  projects: Table<Project, string>;
  notes: Table<Note, string>;
  specs: Table<Spec, string>;
  standards: Table<Standard, string>;
  tasks: Table<Task, string>;
  systems: Table<System, string>;
  archNodes: Table<ArchNode, string>;
  archEdges: Table<ArchEdge, string>;
  docs: Table<Doc, string>;
  devLogs: Table<DevLog, string>;
  agents: Table<Agent, string>;
  commits: Table<Commit, string>;
  memories: Table<Memory, string>;
  links: Table<Link, string>;
  tags: Table<Tag, string>;
  folders: Table<Folder, string>;
  plans: Table<Plan, string>;
  meta: Table<{ key: string; value: string | number }, string>;
  syncFiles: Table<SyncFile, string>;
  vaultMeta: Table<VaultMeta, string>;
  attachments: Table<Attachment, string>;
}

let dbInstance: MasarFlowDB | null = null;

export function resetDbInstance(): void {
  dbInstance = null;
}

export function getDb(): MasarFlowDB {
  if (typeof window === "undefined") {
    throw new Error("Dexie is client-only. Use hooks or wrap in 'use client'.");
  }
  if (dbInstance) return dbInstance;
  const db = new Dexie("masarflow") as MasarFlowDB;
  db.version(1).stores({
    projects: "id, slug, updatedAt",
    notes: "id, projectId, type, updatedAt, *tags, folderId",
    specs: "id, projectId, status, number, updatedAt",
    standards: "id, projectId, category, updatedAt",
    tasks: "id, projectId, status, priority, specId, updatedAt, *dependencies, *tags",
    systems: "id, projectId, name",
    archNodes: "id, projectId, systemId, type",
    archEdges: "id, source, target, kind",
    docs: "id, projectId, kind, updatedAt",
    devLogs: "id, projectId, kind, createdAt",
    agents: "id, role, status",
    commits: "id, projectId, date, hash",
    memories: "id, projectId, kind, *tags, weight, lastRecallAt",
    links: "id, sourceType, sourceId, targetType, targetId, kind",
    tags: "id, name",
    folders: "id, projectId, parentId, name",
    plans: "id, specId, status, createdAt",
    meta: "key",
  });
  db.version(2).stores({
    projects: "id, slug, updatedAt",
    notes: "id, projectId, type, updatedAt, *tags, folderId",
    specs: "id, projectId, status, number, updatedAt",
    standards: "id, projectId, category, updatedAt",
    tasks: "id, projectId, status, priority, specId, updatedAt, *dependencies, *tags",
    systems: "id, projectId, name",
    archNodes: "id, projectId, systemId, type",
    archEdges: "id, source, target, kind",
    docs: "id, projectId, kind, updatedAt",
    devLogs: "id, projectId, kind, createdAt",
    agents: "id, role, status",
    commits: "id, projectId, date, hash",
    memories: "id, projectId, kind, *tags, weight, lastRecallAt",
    links: "id, sourceType, sourceId, targetType, targetId, kind",
    tags: "id, name",
    folders: "id, projectId, parentId, name",
    plans: "id, specId, status, createdAt",
    meta: "key",
    syncFiles: "id, projectId, status, lastSyncedAt, relativePath",
    vaultMeta: "key",
    attachments: "id, projectId, relativePath, cachedAt",
  });
  dbInstance = db;
  return db;
}
