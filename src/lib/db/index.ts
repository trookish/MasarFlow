import Dexie, { type EntityTable } from "dexie";
import type {
  Project,
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
} from "./schema";

/**
 * The local-first MasarFlow database. All domain models persist to IndexedDB
 * under the name "masarflow". Primary key is always the inbound `id` (a UUID).
 */
export class MasarFlowDB extends Dexie {
  projects!: EntityTable<Project, "id">;
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
  }
}

/**
 * Singleton DB instance. Construction is SSR-safe — Dexie only touches
 * IndexedDB when a query runs, which on the App Router happens exclusively in
 * client effects (e.g. `useLiveQuery`), never during server rendering.
 */
export const db = new MasarFlowDB();
