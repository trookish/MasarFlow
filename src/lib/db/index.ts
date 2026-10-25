import type { DomainEvent, TrashEntry } from "@/lib/domain/events";
import Dexie, { type EntityTable } from "dexie";
import { uuid, now } from "@/lib/utils/ids";
import type {
  Project,
  ProjectCategory,
  Folder,
  Note,
  NoteTemplate,
  Spec,
  Standard,
  Task,
  Sprint,
  System,
  ArchNode,
  ArchEdge,
  Doc,
  DevLog,
  Agent,
  AgentRun,
  AgentStep,
  Commit,
  Memory,
  Link,
  Canvas,
  CanvasNode,
  CanvasEdge,
  SyncFile,
  Attachment,
  WatchEvent,
  PluginState,
  AiConnection,
  ChatThread,
  ChatMessage,
  LinkedProject,
  WorkflowRun,
  WorkflowStep,
  CodeFinding,
  LinkSuggestion,
  ParsedContent,
  AiUndo,
  EmbeddingRow,
  Activity,
} from "./schema";

/**
 * The local-first MasarFlow database. All domain models persist to IndexedDB
 * under the name "masarflow". Primary key is always the inbound `id` (a UUID).
 */
export class MasarFlowDB extends Dexie {
  projects!: EntityTable<Project, "id">;
  projectCategories!: EntityTable<ProjectCategory, "id">;
  folders!: EntityTable<Folder, "id">;
  notes!: EntityTable<Note, "id">;
  noteTemplates!: EntityTable<NoteTemplate, "id">;
  specs!: EntityTable<Spec, "id">;
  standards!: EntityTable<Standard, "id">;
  tasks!: EntityTable<Task, "id">;
  sprints!: EntityTable<Sprint, "id">;
  systems!: EntityTable<System, "id">;
  archNodes!: EntityTable<ArchNode, "id">;
  archEdges!: EntityTable<ArchEdge, "id">;
  docs!: EntityTable<Doc, "id">;
  devLogs!: EntityTable<DevLog, "id">;
  agents!: EntityTable<Agent, "id">;
  agentRuns!: EntityTable<AgentRun, "id">;
  agentSteps!: EntityTable<AgentStep, "id">;
  commits!: EntityTable<Commit, "id">;
  memories!: EntityTable<Memory, "id">;
  links!: EntityTable<Link, "id">;
  canvases!: EntityTable<Canvas, "id">;
  canvasNodes!: EntityTable<CanvasNode, "id">;
  canvasEdges!: EntityTable<CanvasEdge, "id">;
  syncFiles!: EntityTable<SyncFile, "id">;
  attachments!: EntityTable<Attachment, "id">;
  watchEvents!: EntityTable<WatchEvent, "id">;
  plugins!: EntityTable<PluginState, "id">;
  aiConnections!: EntityTable<AiConnection, "id">;
  chatThreads!: EntityTable<ChatThread, "id">;
  chatMessages!: EntityTable<ChatMessage, "id">;
  linkedProjects!: EntityTable<LinkedProject, "id">;
  workflowRuns!: EntityTable<WorkflowRun, "id">;
  workflowSteps!: EntityTable<WorkflowStep, "id">;
  codeFindings!: EntityTable<CodeFinding, "id">;
  linkSuggestions!: EntityTable<LinkSuggestion, "id">;
  parsedContents!: EntityTable<ParsedContent, "id">;
  aiUndo!: EntityTable<AiUndo, "id">;
  embeddings!: EntityTable<EmbeddingRow, "id">;
  activity!: EntityTable<Activity, "id">;
  events!: EntityTable<DomainEvent, "id">;
  trash!: EntityTable<TrashEntry, "id">;

  constructor() {
    super("masarflow");
    this.version(1).stores({
      projects: "id, slug, updatedAt",
      folders: "id, projectId, parentId",
      notes: "id, projectId, folderId, type, updatedAt, *tags",
      noteTemplates: "id, projectId, type",
      specs: "id, projectId, number, status, updatedAt",
      standards: "id, projectId, category, enforced",
      tasks:
        "id, projectId, status, priority, specId, sprintId, parentTaskId, updatedAt, *tags",
      sprints: "id, projectId, status",
      systems: "id, projectId",
      archNodes: "id, projectId",
      archEdges: "id, projectId, source, target",
      docs: "id, projectId, slug, category, updatedAt",
      devLogs: "id, projectId, type, createdAt",
      agents: "id, role",
      agentRuns: "id, projectId, agentId, status, createdAt",
      agentSteps: "id, runId, order",
      commits: "id, projectId, sha, date",
      memories: "id, projectId, type, updatedAt, *tags",
      links:
        "id, projectId, sourceId, targetId, linkType, [sourceType+sourceId], [targetType+targetId]",
      canvases: "id, projectId, updatedAt",
      canvasNodes: "id, canvasId",
      canvasEdges: "id, canvasId, source, target",
      syncFiles: "id, projectId, path, status",
      attachments: "id, projectId",
    });
    // v2: Project Watcher change feed (additive — preserves existing data).
    this.version(2).stores({
      watchEvents: "id, projectId, kind, fileType, createdAt",
    });
    // v3: per-project plugin install/enable state (additive).
    this.version(3).stores({
      plugins: "id, projectId, pluginId, [projectId+pluginId]",
    });
    // v4: Chat — provider connections, threads, and messages (additive).
    this.version(4).stores({
      aiConnections: "id, providerId, updatedAt",
      chatThreads: "id, projectId, connectionId, updatedAt",
      chatMessages: "id, threadId, createdAt",
    });
    // v5: AI Workflow — pipeline runs and their steps (additive).
    this.version(5).stores({
      workflowRuns: "id, projectId, updatedAt",
      workflowSteps: "id, runId, order",
    });
    // v6: Phase 2 intelligence — code analysis reports, reviewable link
    // suggestions, and parsed-content cache for binary files (additive).
    this.version(6).stores({
      codeFindings: "id, projectId, path, analyzedAt",
      linkSuggestions: "id, projectId, status, [projectId+status]",
      parsedContents: "id, projectId, path, modality",
    });
    // v7: external project folders linked to workspace projects for the
    // agentic filesystem/shell tools (additive).
    this.version(7).stores({
      linkedProjects: "id, projectId",
    });
    // v8: backfill fields on rows written before they existed in the schema
    // (missing `dependencies` crashed the dashboard metrics; missing commit
    // fields crashed the commits feed).
    this.version(8).stores({}).upgrade(async (tx) => {
      await tx
        .table("systems")
        .toCollection()
        .modify(
          (s: {
            dependencies?: string[];
            health?: unknown;
            description?: unknown;
            category?: unknown;
            status?: unknown;
          }) => {
            if (s.dependencies === undefined) s.dependencies = [];
            if (typeof s.health !== "number") s.health = 100;
            if (typeof s.description !== "string") s.description = "";
            if (typeof s.category !== "string") s.category = "module";
            if (typeof s.status !== "string") s.status = "active";
          },
        );
      await tx
        .table("commits")
        .toCollection()
        .modify(
          (c: {
            sha?: unknown;
            message?: unknown;
            author?: unknown;
            date?: unknown;
            files?: unknown;
            additions?: unknown;
            deletions?: unknown;
            aiSummary?: unknown;
            linkedSpecIds?: unknown;
            linkedTaskIds?: unknown;
          }) => {
            if (typeof c.sha !== "string") c.sha = "";
            if (typeof c.message !== "string") c.message = "";
            if (typeof c.author !== "string") c.author = "";
            if (typeof c.date !== "number") c.date = 0;
            if (!Array.isArray(c.files)) c.files = [];
            if (typeof c.additions !== "number") c.additions = 0;
            if (typeof c.deletions !== "number") c.deletions = 0;
            if (typeof c.aiSummary !== "string") c.aiSummary = "";
            if (!Array.isArray(c.linkedSpecIds)) c.linkedSpecIds = [];
            if (!Array.isArray(c.linkedTaskIds)) c.linkedTaskIds = [];
          },
        );
    });
    // v9: reversible AI workspace mutations (additive). Each row captures the
    // entity before/after a mutating agent tool call so chat can roll back.
    this.version(9).stores({
      aiUndo: "id, projectId, chatMessageId, createdAt",
    });
    // v10: per-project categories (additive + backfill). Existing projects
    // with a legacy category value get it migrated into the new table so the
    // picker still shows it, with the legacy preset codes expanded to labels.
    this.version(10)
      .stores({
        projectCategories: "id, projectId",
      })
      .upgrade(async (tx) => {
        const legacyLabels: Record<string, string> = {
          "web-app": "Web app",
          mobile: "Mobile app",
          game: "Game",
          "cli-tool": "CLI / tool",
          library: "Library / package",
          data: "Data / research",
          other: "Other",
        };
        const projects = await tx.table("projects").toArray();
        for (const p of projects) {
          const raw = (p as { category?: unknown }).category;
          const name = typeof raw === "string" && raw ? raw : "";
          if (!name) continue;
          const label = legacyLabels[name] ?? name;
          await tx
            .table("projectCategories")
            .add({ id: uuid(), projectId: p.id, name: label, createdAt: now() });
        }
      });
    // v11: local semantic index (additive). Vectors are produced in-browser by the
    // embedding worker; the table is rebuildable and excluded from backups.
    this.version(11).stores({
      embeddings: "id, projectId, [projectId+kind], [projectId+entityId]",
    });
    // v12: activity log (additive).
    this.version(12).stores({
      activity: "id, projectId, [projectId+createdAt], [projectId+entityKind+entityId]",
    });
    // v13 (v0.3 P2): domain event feed and trash (additive). Removed entities move to `trash` with
    // the links and references needed to restore them; see src/lib/domain/commands/trash.ts.
    this.version(13).stores({
      events: "id, projectId, [projectId+at], [entityKind+entityId]",
      trash: "id, projectId, kind, deletedAt",
    });
    // v0.3 P3: the index is keyed per adapter and upserted, never replaced. Older rows had no
    // adapter and could be duplicated by repeated replace-all runs; keep the newest per entity.
    // v0.3 P4: retention prunes tool results by age, so agentSteps needs a createdAt index.
    this.version(15).stores({ agentSteps: "id, runId, order, createdAt" });
    this.version(14)
      .stores({ syncFiles: "id, projectId, path, status, entityId, [projectId+adapter]" })
      .upgrade(async (tx) => {
        const table = tx.table("syncFiles");
        const rows = (await table.toArray()) as Array<{
          id: string;
          projectId: string;
          adapter?: string;
          path: string;
          entityType: string | null;
          entityId: string | null;
          lastSyncedAt: number | null;
        }>;
        const keep = new Map<string, (typeof rows)[number]>();
        const drop: string[] = [];
        for (const r of rows) {
          const adapter = r.adapter ?? "folder";
          const key = r.entityId ? `${r.projectId}|${adapter}|${r.entityType}|${r.entityId}` : `${r.projectId}|${adapter}|path|${r.path}`;
          const prev = keep.get(key);
          if (!prev) {
            keep.set(key, r);
            continue;
          }
          const newer = (r.lastSyncedAt ?? 0) > (prev.lastSyncedAt ?? 0) ? r : prev;
          drop.push(newer === r ? prev.id : r.id);
          keep.set(key, newer);
        }
        if (drop.length) await table.bulkDelete(drop);
        await table.toCollection().modify((r: { adapter?: string }) => {
          if (!r.adapter) r.adapter = "folder";
        });
      });
  }
}

/**
 * Singleton DB instance. Construction is SSR-safe — Dexie only touches
 * IndexedDB when a query runs, which on the App Router happens exclusively in
 * client effects (e.g. `useLiveQuery`), never during server rendering.
 */
export const db = new MasarFlowDB();
