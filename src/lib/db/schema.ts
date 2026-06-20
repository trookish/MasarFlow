import { z } from "zod";

/**
 * MasarFlow domain schema.
 *
 * Every table has a Zod schema (the runtime contract) and an inferred
 * TypeScript type (the compile-time contract). Records are stored locally in
 * IndexedDB via Dexie under the database name "masarflow".
 *
 * Timestamps are epoch milliseconds (number).
 */

/* ── Shared enums ────────────────────────────────────────────────────── */

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
export const noteTypeSchema = z.enum(NOTE_TYPES);
export type NoteType = z.infer<typeof noteTypeSchema>;

export const specStatusSchema = z.enum([
  "draft",
  "review",
  "approved",
  "implementing",
  "shipped",
]);
export type SpecStatus = z.infer<typeof specStatusSchema>;

export const standardCategorySchema = z.enum([
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
]);
export type StandardCategory = z.infer<typeof standardCategorySchema>;

export const taskStatusSchema = z.enum([
  "backlog",
  "todo",
  "in_progress",
  "review",
  "done",
]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const taskPrioritySchema = z.enum(["low", "medium", "high", "urgent"]);
export type TaskPriority = z.infer<typeof taskPrioritySchema>;

export const assigneeSchema = z.enum([
  "human",
  "ai",
  "architect",
  "programmer",
  "reviewer",
  "tester",
  "documenter",
  "designer",
  "optimizer",
]);
export type Assignee = z.infer<typeof assigneeSchema>;

/** Entity kinds that can participate in links / the knowledge graph. */
export const entityKindSchema = z.enum([
  "note",
  "spec",
  "task",
  "system",
  "commit",
  "memory",
  "doc",
  "archNode",
]);
export type EntityKind = z.infer<typeof entityKindSchema>;

/* ── Tables ──────────────────────────────────────────────────────────── */

export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().default(""),
  health: z.number().min(0).max(100).default(100),
  archScore: z.number().min(0).max(100).default(100),
  techDebt: z.number().min(0).max(100).default(0),
  accent: z.string().default("violet"),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Project = z.infer<typeof projectSchema>;

/**
 * Folders organize notes into a tree. Not in the original 18-table list but
 * required to back the Brain folder tree; kept intentionally lightweight.
 */
export const folderSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  parentId: z.string().nullable().default(null),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Folder = z.infer<typeof folderSchema>;

export const noteSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  type: noteTypeSchema.default("note"),
  title: z.string(),
  body: z.string().default(""),
  excerpt: z.string().default(""),
  tags: z.array(z.string()).default([]),
  folderId: z.string().nullable().default(null),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Note = z.infer<typeof noteSchema>;

export const noteTemplateSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  description: z.string().default(""),
  type: noteTypeSchema.default("note"),
  body: z.string().default(""),
  tags: z.array(z.string()).default([]),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type NoteTemplate = z.infer<typeof noteTemplateSchema>;

export const specSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  number: z.string(),
  title: z.string(),
  status: specStatusSchema.default("draft"),
  purpose: z.string().default(""),
  goals: z.array(z.string()).default([]),
  features: z.array(z.string()).default([]),
  constraints: z.array(z.string()).default([]),
  dependencies: z.array(z.string()).default([]),
  acceptance: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  futureImprovements: z.array(z.string()).default([]),
  technicalNotes: z.string().default(""),
  implementationProgress: z.number().min(0).max(100).default(0),
  linkedNoteIds: z.array(z.string()).default([]),
  linkedTaskIds: z.array(z.string()).default([]),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Spec = z.infer<typeof specSchema>;

export const standardSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  category: standardCategorySchema.default("other"),
  title: z.string(),
  rule: z.string().default(""),
  examples: z.array(z.string()).default([]),
  enforced: z.boolean().default(true),
  /**
   * Optional regular expression treated as a *forbidden* pattern. When set and
   * the standard is enforced, the enforcer flags any note/spec/task content
   * that matches it. Empty means "documentation-only" (not machine-checked).
   * Not indexed — added without a Dexie version bump.
   */
  pattern: z.string().default(""),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Standard = z.infer<typeof standardSchema>;

export const taskSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  description: z.string().default(""),
  status: taskStatusSchema.default("backlog"),
  priority: taskPrioritySchema.default("medium"),
  specId: z.string().nullable().default(null),
  sprintId: z.string().nullable().default(null),
  parentTaskId: z.string().nullable().default(null),
  assignee: assigneeSchema.default("human"),
  dependencies: z.array(z.string()).default([]),
  progress: z.number().min(0).max(100).default(0),
  tags: z.array(z.string()).default([]),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Task = z.infer<typeof taskSchema>;

export const sprintSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  goal: z.string().default(""),
  status: z.enum(["planned", "active", "completed"]).default("planned"),
  startDate: z.number().nullable().default(null),
  endDate: z.number().nullable().default(null),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Sprint = z.infer<typeof sprintSchema>;

export const systemSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  description: z.string().default(""),
  category: z.string().default("module"),
  status: z.enum(["planned", "active", "deprecated"]).default("active"),
  health: z.number().min(0).max(100).default(100),
  dependencies: z.array(z.string()).default([]),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type System = z.infer<typeof systemSchema>;

export const archNodeSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  label: z.string(),
  type: z.string().default("module"),
  x: z.number().default(0),
  y: z.number().default(0),
  data: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type ArchNode = z.infer<typeof archNodeSchema>;

export const archEdgeSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  source: z.string(),
  target: z.string(),
  label: z.string().default(""),
  type: z.string().default("default"),
  createdAt: z.number(),
});
export type ArchEdge = z.infer<typeof archEdgeSchema>;

export const docSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  slug: z.string(),
  category: z.string().default("general"),
  body: z.string().default(""),
  sourceType: z.enum(["manual", "auto"]).default("manual"),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Doc = z.infer<typeof docSchema>;

export const devLogSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  type: z
    .enum(["commit", "change", "system", "agent", "note", "spec", "task"])
    .default("change"),
  title: z.string(),
  body: z.string().default(""),
  refType: entityKindSchema.nullable().default(null),
  refId: z.string().nullable().default(null),
  createdAt: z.number(),
});
export type DevLog = z.infer<typeof devLogSchema>;

export const agentSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: assigneeSchema,
  description: z.string().default(""),
  model: z.string().default(""),
  systemPrompt: z.string().default(""),
  enabled: z.boolean().default(true),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Agent = z.infer<typeof agentSchema>;

export const agentRunSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  agentId: z.string(),
  status: z
    .enum(["queued", "running", "waiting", "done", "error"])
    .default("queued"),
  input: z.string().default(""),
  output: z.string().default(""),
  startedAt: z.number().nullable().default(null),
  finishedAt: z.number().nullable().default(null),
  createdAt: z.number(),
});
export type AgentRun = z.infer<typeof agentRunSchema>;

export const agentStepSchema = z.object({
  id: z.string(),
  runId: z.string(),
  order: z.number(),
  type: z.enum(["think", "action", "result", "status"]).default("think"),
  content: z.string().default(""),
  createdAt: z.number(),
});
export type AgentStep = z.infer<typeof agentStepSchema>;

export const commitSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  sha: z.string(),
  message: z.string(),
  author: z.string().default(""),
  date: z.number(),
  files: z.array(z.string()).default([]),
  additions: z.number().default(0),
  deletions: z.number().default(0),
  aiSummary: z.string().default(""),
  linkedSpecIds: z.array(z.string()).default([]),
  linkedTaskIds: z.array(z.string()).default([]),
  createdAt: z.number(),
});
export type Commit = z.infer<typeof commitSchema>;

export const memorySchema = z.object({
  id: z.string(),
  projectId: z.string(),
  type: z.enum(["fact", "lesson", "decision", "preference"]).default("fact"),
  content: z.string(),
  weight: z.number().min(0).max(1).default(0.5),
  tags: z.array(z.string()).default([]),
  sourceType: entityKindSchema.nullable().default(null),
  sourceId: z.string().nullable().default(null),
  lastAccessedAt: z.number().nullable().default(null),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Memory = z.infer<typeof memorySchema>;

export const linkSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  sourceType: entityKindSchema,
  sourceId: z.string(),
  targetType: entityKindSchema,
  targetId: z.string(),
  linkType: z
    .enum(["wikilink", "dependency", "reference", "implements", "relates"])
    .default("reference"),
  label: z.string().default(""),
  createdAt: z.number(),
});
export type Link = z.infer<typeof linkSchema>;

export const canvasSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  description: z.string().default(""),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Canvas = z.infer<typeof canvasSchema>;

export const canvasNodeSchema = z.object({
  id: z.string(),
  canvasId: z.string(),
  type: z.enum(["note", "text", "link", "media"]).default("text"),
  x: z.number().default(0),
  y: z.number().default(0),
  width: z.number().default(240),
  height: z.number().default(140),
  /** Free-form payload: { text } | { noteId } | { url } | { src } */
  data: z.record(z.string(), z.unknown()).default({}),
  color: z.string().default(""),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type CanvasNode = z.infer<typeof canvasNodeSchema>;

export const canvasEdgeSchema = z.object({
  id: z.string(),
  canvasId: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().nullable().default(null),
  targetHandle: z.string().nullable().default(null),
  label: z.string().default(""),
  color: z.string().default(""),
  createdAt: z.number(),
});
export type CanvasEdge = z.infer<typeof canvasEdgeSchema>;

export const syncFileSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  path: z.string(),
  hash: z.string().default(""),
  mtime: z.number().default(0),
  status: z
    .enum(["synced", "local_modified", "remote_modified", "conflict", "new"])
    .default("new"),
  entityType: entityKindSchema.nullable().default(null),
  entityId: z.string().nullable().default(null),
  lastSyncedAt: z.number().nullable().default(null),
});
export type SyncFile = z.infer<typeof syncFileSchema>;

export const attachmentSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  mimeType: z.string().default("application/octet-stream"),
  size: z.number().default(0),
  blob: z.custom<Blob>(),
  createdAt: z.number(),
});
export type Attachment = z.infer<typeof attachmentSchema>;

export const watchEventSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  path: z.string(),
  kind: z.enum(["created", "modified", "deleted"]).default("modified"),
  fileType: z
    .enum(["code", "asset", "scene", "shader", "config", "doc", "other"])
    .default("other"),
  /** Optional mapping to a system in the Architecture catalog. */
  systemId: z.string().nullable().default(null),
  createdAt: z.number(),
});
export type WatchEvent = z.infer<typeof watchEventSchema>;
export type WatchKind = WatchEvent["kind"];
export type WatchFileType = WatchEvent["fileType"];

export const pluginStateSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  pluginId: z.string(),
  enabled: z.boolean().default(true),
  settings: z.record(z.string(), z.union([z.string(), z.boolean()])).default({}),
  installedAt: z.number(),
  updatedAt: z.number(),
});
export type PluginState = z.infer<typeof pluginStateSchema>;
