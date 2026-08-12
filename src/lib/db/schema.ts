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

/**
 * Suggested standard categories — kept as documentation for the UI and AI
 * tool descriptions. The stored value itself is free-form so users can add
 * their own categories.
 */
export const STANDARD_CATEGORIES = [
  "naming",
  "structure",
  "comments",
  "patterns",
  "performance",
  "events",
  "di",
  "files",
  "ui",
  "web",
  "database",
  "security",
  "testing",
  "unity",
  "networking",
  "other",
] as const;
export type StandardCategory = string;

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
  icon: z.string().default("box"),
  /** Custom image overriding the lucide icon (data URL or remote URL). */
  iconImage: z.string().default(""),
  tags: z.array(z.string()).default([]),
  category: z.string().default(""),
  /** Project banner image (data URL or remote URL). */
  banner: z.string().default(""),
  /** How the banner is shown: hidden, header banner, or workspace background. */
  bannerMode: z.enum(["none", "banner", "background"]).default("none"),
  /** Background blur in px (background mode only). */
  bannerBlur: z.number().min(0).max(24).default(0),
  /** Background brightness percent (background mode only). */
  bannerBrightness: z.number().min(10).max(100).default(100),
  health: z.number().min(0).max(100).default(100),
  archScore: z.number().min(0).max(100).default(100),
  techDebt: z.number().min(0).max(100).default(0),
  accent: z.string().default("violet"),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Project = z.infer<typeof projectSchema>;

/**
 * Per-project category names. New projects start with none — categories are
 * added by the user via the "Add category" picker (demo projects seed their
 * own). The project row's `category` holds the selected one of these.
 */
export const projectCategorySchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  createdAt: z.number(),
});
export type ProjectCategory = z.infer<typeof projectCategorySchema>;

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
  category: z.string().default("other"),
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
  type: z.enum(["note", "text", "link", "media", "group"]).default("text"),
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
  settings: z
    .record(z.string(), z.union([z.string(), z.boolean()]))
    .default({}),
  installedAt: z.number(),
  updatedAt: z.number(),
});
export type PluginState = z.infer<typeof pluginStateSchema>;

/** A user-configured connection to an AI provider (key stored locally). */
export const aiConnectionSchema = z.object({
  id: z.string(),
  providerId: z.string(),
  label: z.string(),
  apiKey: z.string().default(""),
  baseUrl: z.string().default(""),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type AiConnection = z.infer<typeof aiConnectionSchema>;

export const chatThreadSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string().default("New chat"),
  connectionId: z.string().default(""),
  modelId: z.string().default(""),
  /**
   * Which backend powers this thread's turns:
   *   opencode — the OpenCode server (default; fs/shell tools with approvals);
   *   api      — a saved AI connection through /api/chat (browser Agent Loop);
   *   ollama   — the local Ollama server (browser Agent Loop, no API key).
   * Not indexed — added without a Dexie version bump.
   */
  backend: z.enum(["opencode", "api", "ollama"]).default("opencode"),
  /**
   * agentic — grounded in the workspace briefing and able to act via tools;
   * chat — a direct conversation with the model, no workspace injection.
   * Not indexed — added without a Dexie version bump.
   */
  mode: z.enum(["agentic", "chat"]).default("agentic"),
  /** Extended thinking/reasoning, for models that support it. Not indexed. */
  reasoningEnabled: z.boolean().default(false),
  /**
   * OpenCode-backed chat: the persistent OpenCode session this thread maps
   * to (1:1). Blank until the first ensure — recreated automatically if the
   * server lost it. Not indexed — added without a Dexie version bump.
   */
  opencodeSessionId: z.string().default(""),
  /** The session's working directory (linked project root or workspace). */
  opencodeDirectory: z.string().default(""),
  /** OpenCode provider id (e.g. "anthropic", "opencode-go"). Not indexed. */
  providerId: z.string().default(""),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type ChatThread = z.infer<typeof chatThreadSchema>;
export type ChatMode = ChatThread["mode"];
export type ChatBackend = ChatThread["backend"];

/** One tool invocation recorded on an assistant chat message. */
export const toolActivitySchema = z.object({
  name: z.string(),
  summary: z.string().default(""),
  ok: z.boolean().default(true),
  /** True while the tool is executing during a live stream (not persisted). */
  running: z.boolean().default(false),
});
export type ToolActivity = z.infer<typeof toolActivitySchema>;

/** Entity kinds the AI workspace tools can mutate (for undo bookkeeping). */
export const aiUndoKindSchema = z.enum([
  "note",
  "spec",
  "task",
  "standard",
  "system",
  "sprint",
  "doc",
  "devlog",
  "memory",
  "canvas",
  "folder",
  "link",
  "commit",
]);
export type AiUndoKind = z.infer<typeof aiUndoKindSchema>;

/**
 * A reversible AI workspace mutation. Captured around each mutating tool call
 * so the user can roll back a model-made change (restore, delete, or re-add
 * the entity) directly from the chat message that caused it.
 */
export const aiUndoSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  /** The assistant chat message whose tool call caused the change. */
  chatMessageId: z.string(),
  toolName: z.string(),
  kind: aiUndoKindSchema,
  /** Dexie table holding the entity (revert works against the raw table). */
  table: z.string(),
  /** Entity row id the tool call targeted (or created). */
  entityId: z.string(),
  action: z.enum(["create", "update", "delete"]),
  /** Pre-mutation entity row (null when the entity was created). */
  before: z.unknown().nullable().default(null),
  /** Post-mutation entity row (null when the entity was deleted). */
  after: z.unknown().nullable().default(null),
  createdAt: z.number(),
});
export type AiUndo = z.infer<typeof aiUndoSchema>;

/** An attachment carried on a chat message. */
export const chatAttachmentSchema = z.object({
  name: z.string(),
  mimeType: z.string().default("application/octet-stream"),
  kind: z.enum(["image", "file"]).default("file"),
  /** Images: downscaled data URL used for display and resending. */
  dataUrl: z.string().default(""),
  /** Text files: extracted content that was inlined into the prompt. */
  textContent: z.string().default(""),
});
export type ChatAttachment = z.infer<typeof chatAttachmentSchema>;

export const chatMessageSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().default(""),
  /**
   * Turn lifecycle for assistant messages. User/system messages are always
   * "done". A message left in "streaming" means the session died mid-turn —
   * the UI renders it as "Interrupted — Retry" instead of a blank bubble.
   * Not indexed — added without a Dexie version bump.
   */
  status: z.enum(["streaming", "done", "error", "cancelled"]).default("done"),
  /**
   * The model's reasoning/thinking trace for this message (extended thinking,
   * reasoning_content, etc.). Empty string when the model produced none.
   * Not indexed — added without a Dexie version bump.
   */
  reasoning: z.string().default(""),
  error: z.string().nullable().default(null),
  /**
   * Workspace tool calls the assistant executed while producing this message.
   * Not indexed — added without a Dexie version bump.
   */
  toolActivity: z.array(toolActivitySchema).default([]),
  /** Images/files the user attached to this message. Not indexed. */
  attachments: z.array(chatAttachmentSchema).default([]),
  /** Degradation notices from the proxy (e.g. "tools disabled"). Not indexed. */
  notices: z.array(z.string()).default([]),
  /**
   * Files the assistant edited while producing this message (OpenCode agent
   * turns). Not indexed — added without a Dexie version bump.
   */
  files: z.array(z.string()).default([]),
  /**
   * The OpenCode message id backing this assistant message — used for the
   * file-change Undo (revert) action. Not indexed.
   */
  opencodeMessageId: z.string().default(""),
  createdAt: z.number(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

/**
 * An external project folder on the user's machine linked to a workspace
 * project — e.g. a web app, a Unity game, or a desktop tool. In agentic chat
 * mode the AI gets filesystem/shell tools scoped to linked roots (reads
 * auto-allowed, writes and shell commands need explicit per-action user
 * approval).
 */
export const linkedProjectSchema = z.object({
  id: z.string(),
  /** The workspace project this external folder augments. */
  projectId: z.string(),
  /** Display label (defaults to the folder's basename). */
  name: z.string(),
  /** Absolute path to the folder root. */
  rootPath: z.string(),
  createdAt: z.number(),
});
export type LinkedProject = z.infer<typeof linkedProjectSchema>;

/** A run of the 16-step idea → implementation workflow. */
export const workflowRunSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string().default("Untitled workflow"),
  idea: z.string().default(""),
  connectionId: z.string(),
  modelId: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type WorkflowRun = z.infer<typeof workflowRunSchema>;

export const workflowStepSchema = z.object({
  id: z.string(),
  runId: z.string(),
  stepKey: z.string(),
  order: z.number(),
  status: z.enum(["pending", "running", "done", "error"]).default("pending"),
  output: z.string().default(""),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type WorkflowStep = z.infer<typeof workflowStepSchema>;

/* ── Phase 2: Intelligence tier (Python-backed) ─────────────────────── */

/**
 * A code-analysis report for one source file, produced by the Python
 * tree-sitter service (#4). Persists violations, metrics, and symbols so the
 * enforcer panel and tech-debt metric don't recompute on every render.
 */
export const codeFindingSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  path: z.string(),
  language: z.string().default(""),
  violations: z
    .array(
      z.object({
        rule: z.string(),
        severity: z.enum(["error", "warning", "info"]).default("warning"),
        message: z.string().default(""),
        line: z.number().int().min(1).default(1),
        snippet: z.string().default(""),
      }),
    )
    .default([]),
  metrics: z
    .object({
      loc: z.number().int().min(0).default(0),
      cyclomatic: z.number().int().min(0).default(0),
      cognitive: z.number().int().min(0).default(0),
    })
    .default({ loc: 0, cyclomatic: 0, cognitive: 0 }),
  symbols: z
    .array(
      z.object({
        name: z.string(),
        kind: z.string().default(""),
        line: z.number().int().min(1).default(1),
      }),
    )
    .default([]),
  analyzedAt: z.number(),
  updatedAt: z.number(),
});
export type CodeFinding = z.infer<typeof codeFindingSchema>;

/**
 * A reviewable predicted graph edge (#5), produced by the Python networkx
 * service. Accepting one promotes it to a real `Link`.
 */
export const linkSuggestionSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  sourceType: entityKindSchema,
  sourceId: z.string(),
  targetType: entityKindSchema,
  targetId: z.string(),
  linkType: z
    .enum(["wikilink", "dependency", "reference", "implements", "relates"])
    .default("relates"),
  score: z.number().min(0).max(1).default(0.5),
  reason: z.string().default(""),
  status: z.enum(["pending", "accepted", "dismissed"]).default("pending"),
  createdAt: z.number(),
});
export type LinkSuggestion = z.infer<typeof linkSuggestionSchema>;

/**
 * Extracted-text cache for binary/non-text files (#7), so the embedding
 * pipeline can index PDFs/Office docs/images/audio/web pages without
 * re-parsing on every sync. `hash` detects when re-parse is needed.
 */
export const parsedContentSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  path: z.string(),
  modality: z.enum(["web", "pdf", "office", "image", "audio"]).default("web"),
  text: z.string().default(""),
  meta: z.record(z.string(), z.unknown()).default({}),
  hash: z.string().default(""),
  parsedAt: z.number(),
  updatedAt: z.number(),
});
export type ParsedContent = z.infer<typeof parsedContentSchema>;
