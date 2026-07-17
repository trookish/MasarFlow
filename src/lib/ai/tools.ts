import {
  notesRepo,
  specsRepo,
  tasksRepo,
  sprintsRepo,
  docsRepo,
  devLogsRepo,
  memoriesRepo,
  standardsRepo,
  systemsRepo,
  canvasRepo,
  foldersRepo,
  linksRepo,
  commitsRepo,
  noteTemplatesRepo,
  agentsRepo,
  agentRunsRepo,
  workflowRepo,
  pluginsRepo,
  syncRepo,
  watchEventsRepo,
} from "@/lib/db/repos";
import {
  taskStatusSchema,
  taskPrioritySchema,
  assigneeSchema,
  noteTypeSchema,
  specStatusSchema,
  standardCategorySchema,
  type EntityKind,
  type Spec,
  type Task,
  type Standard,
  type System,
  type Sprint,
  type Canvas,
  type Folder,
  type Commit,
} from "@/lib/db/schema";
import { buildSearchItems, createSearchIndex, type SearchItem } from "@/lib/utils/search";

/**
 * The workspace tool belt: real function-calling tools the AI uses to read
 * and mutate the local database. Definitions use provider-neutral JSON Schema
 * (converted to OpenAI/Anthropic shapes by /api/chat); execution runs in the
 * browser against the Dexie repos, and every mutation writes a dev-log entry
 * so the trail is visible in Dev Logs.
 *
 * Coverage is page-to-page: every workspace page's backing entities are
 * readable, and the content pages are creatable/updatable. Config/pipeline
 * pages (agents, workflow, plugins, sync, watcher, files) are read-only.
 */

export interface WorkspaceToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

const str = (description: string) => ({ type: "string", description });
const strArr = (description: string) => ({
  type: "array",
  items: { type: "string" },
  description,
});
const num = (description: string) => ({ type: "number", description });
const enumOf = (values: readonly string[], description: string) => ({
  type: "string",
  enum: [...values],
  description,
});

export const WORKSPACE_TOOLS: WorkspaceToolDef[] = [
  {
    name: "search_workspace",
    description:
      "Fuzzy-search everything in the workspace (notes, specs, tasks, docs, standards, systems, memories, dev logs). Use before claiming something does not exist.",
    parameters: {
      type: "object",
      properties: {
        query: str("Free-text search query."),
        limit: num("Max results (default 10)."),
      },
      required: ["query"],
    },
  },

  /* ── Brain: notes, templates, canvas, folders ──────────────────────── */
  {
    name: "read_note",
    description:
      "Read a brain note's full markdown body by id or exact title.",
    parameters: {
      type: "object",
      properties: {
        id: str("Note id (preferred when known)."),
        title: str("Exact note title (case-insensitive)."),
      },
    },
  },
  {
    name: "create_note",
    description:
      "Create a brain note. Body is markdown; [[Wikilinks]] auto-link to other notes (creating placeholders when needed).",
    parameters: {
      type: "object",
      properties: {
        title: str("Note title."),
        body: str("Markdown body."),
        type: enumOf(noteTypeSchema.options, "Note type (default: note)."),
        tags: strArr("Tags without #."),
        folderId: str("Folder id to place the note under (optional)."),
      },
      required: ["title", "body"],
    },
  },
  {
    name: "update_note",
    description:
      "Update a brain note. Provide body to replace it, or appendBody to add to the end.",
    parameters: {
      type: "object",
      properties: {
        id: str("Note id."),
        title: str("New title."),
        body: str("Replacement markdown body."),
        appendBody: str("Markdown appended to the existing body."),
        tags: strArr("Replacement tag list."),
        folderId: str("Move the note to this folder."),
      },
      required: ["id"],
    },
  },
  {
    name: "list_note_templates",
    description: "List available brain note templates.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "read_note_template",
    description: "Read a note template's body and front-matter by id.",
    parameters: {
      type: "object",
      properties: { id: str("Template id.") },
      required: ["id"],
    },
  },
  {
    name: "list_canvases",
    description: "List all canvases in the project.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "read_canvas",
    description: "Read a canvas with its nodes and edges by id.",
    parameters: {
      type: "object",
      properties: { id: str("Canvas id.") },
      required: ["id"],
    },
  },
  {
    name: "create_canvas",
    description: "Create a blank canvas.",
    parameters: {
      type: "object",
      properties: {
        name: str("Canvas name."),
        description: str("Short description."),
      },
      required: ["name"],
    },
  },
  {
    name: "update_canvas",
    description: "Rename or re-describe a canvas.",
    parameters: {
      type: "object",
      properties: {
        id: str("Canvas id."),
        name: str("New name."),
        description: str("New description."),
      },
      required: ["id"],
    },
  },
  {
    name: "list_folders",
    description: "List all brain folders (the note tree).",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "create_folder",
    description: "Create a folder for organizing notes.",
    parameters: {
      type: "object",
      properties: {
        name: str("Folder name."),
        parentId: str("Parent folder id (null for root)."),
      },
      required: ["name"],
    },
  },
  {
    name: "update_folder",
    description: "Rename a folder or move it under a new parent.",
    parameters: {
      type: "object",
      properties: {
        id: str("Folder id."),
        name: str("New name."),
        parentId: str("New parent folder id (or null for root)."),
      },
      required: ["id"],
    },
  },

  /* ── Specifications ────────────────────────────────────────────────── */
  {
    name: "read_spec",
    description: "Read a full specification by id or RFC number (e.g. RFC-001).",
    parameters: {
      type: "object",
      properties: {
        id: str("Spec id."),
        number: str("Spec number, e.g. RFC-001."),
      },
    },
  },
  {
    name: "create_spec",
    description:
      "Create an RFC-style specification. The RFC number is assigned automatically.",
    parameters: {
      type: "object",
      properties: {
        title: str("Spec title."),
        purpose: str("Why this exists."),
        status: enumOf(specStatusSchema.options, "Status (default: draft)."),
        goals: strArr("Goals."),
        features: strArr("Feature list."),
        constraints: strArr("Constraints."),
        dependencies: strArr("Dependencies."),
        acceptance: strArr("Acceptance criteria."),
        risks: strArr("Risks."),
        technicalNotes: str("Free-form technical notes (markdown)."),
      },
      required: ["title", "purpose"],
    },
  },
  {
    name: "update_spec",
    description: "Update fields of an existing specification.",
    parameters: {
      type: "object",
      properties: {
        id: str("Spec id."),
        title: str("New title."),
        status: enumOf(specStatusSchema.options, "New status."),
        purpose: str("New purpose."),
        goals: strArr("Replacement goals."),
        features: strArr("Replacement features."),
        constraints: strArr("Replacement constraints."),
        acceptance: strArr("Replacement acceptance criteria."),
        risks: strArr("Replacement risks."),
        technicalNotes: str("Replacement technical notes."),
      },
      required: ["id"],
    },
  },

  /* ── Standards ─────────────────────────────────────────────────────── */
  {
    name: "list_standards",
    description: "List coding standards, optionally filtered by category.",
    parameters: {
      type: "object",
      properties: {
        category: enumOf(
          standardCategorySchema.options,
          "Filter by category.",
        ),
      },
    },
  },
  {
    name: "read_standard",
    description: "Read a coding standard's rule and examples by id.",
    parameters: {
      type: "object",
      properties: { id: str("Standard id.") },
      required: ["id"],
    },
  },
  {
    name: "create_standard",
    description: "Create a coding standard.",
    parameters: {
      type: "object",
      properties: {
        title: str("Standard title."),
        rule: str("The rule text."),
        category: enumOf(
          standardCategorySchema.options,
          "Category (default: other).",
        ),
        examples: strArr("Good/bad examples."),
        enforced: { type: "boolean", description: "Machine-enforced (default true)." },
        pattern: str("Optional forbidden regex (empty = documentation-only)."),
      },
      required: ["title", "rule"],
    },
  },
  {
    name: "update_standard",
    description: "Update a coding standard.",
    parameters: {
      type: "object",
      properties: {
        id: str("Standard id."),
        title: str("New title."),
        rule: str("New rule."),
        category: enumOf(standardCategorySchema.options, "New category."),
        examples: strArr("Replacement examples."),
        enforced: { type: "boolean", description: "Machine-enforced." },
        pattern: str("New forbidden regex."),
      },
      required: ["id"],
    },
  },

  /* ── Tasks & sprints ───────────────────────────────────────────────── */
  {
    name: "list_tasks",
    description: "List tasks, optionally filtered by status.",
    parameters: {
      type: "object",
      properties: {
        status: enumOf(taskStatusSchema.options, "Filter by status."),
      },
    },
  },
  {
    name: "create_task",
    description: "Create a task on the board.",
    parameters: {
      type: "object",
      properties: {
        title: str("Task title."),
        description: str("What needs to be done."),
        status: enumOf(taskStatusSchema.options, "Initial status (default: todo)."),
        priority: enumOf(taskPrioritySchema.options, "Priority (default: medium)."),
        assignee: enumOf(assigneeSchema.options, "Who works it (default: human)."),
        specNumber: str("Link to a spec by number, e.g. RFC-001."),
        sprintId: str("Link to a sprint by id."),
        tags: strArr("Tags."),
      },
      required: ["title"],
    },
  },
  {
    name: "update_task",
    description: "Update a task's status, progress, priority, assignee, or description.",
    parameters: {
      type: "object",
      properties: {
        id: str("Task id (find it via list_tasks or search_workspace)."),
        status: enumOf(taskStatusSchema.options, "New status."),
        priority: enumOf(taskPrioritySchema.options, "New priority."),
        assignee: enumOf(assigneeSchema.options, "New assignee."),
        progress: num("Progress 0-100."),
        description: str("New description."),
        title: str("New title."),
        sprintId: str("Move to this sprint (or null to unassign)."),
      },
      required: ["id"],
    },
  },
  {
    name: "list_sprints",
    description: "List all sprints.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "read_sprint",
    description: "Read a sprint by id.",
    parameters: {
      type: "object",
      properties: { id: str("Sprint id.") },
      required: ["id"],
    },
  },
  {
    name: "create_sprint",
    description: "Create a sprint.",
    parameters: {
      type: "object",
      properties: {
        name: str("Sprint name."),
        goal: str("Sprint goal."),
        startDate: str("ISO date, e.g. 2026-07-01."),
        endDate: str("ISO date."),
        status: enumOf(["planned", "active", "completed"], "Status (default planned)."),
      },
      required: ["name"],
    },
  },
  {
    name: "update_sprint",
    description: "Update a sprint's name, goal, status, or date range.",
    parameters: {
      type: "object",
      properties: {
        id: str("Sprint id."),
        name: str("New name."),
        goal: str("New goal."),
        status: enumOf(["planned", "active", "completed"], "New status."),
        startDate: str("New ISO start date."),
        endDate: str("New ISO end date."),
      },
      required: ["id"],
    },
  },

  /* ── Architecture / systems ────────────────────────────────────────── */
  {
    name: "list_systems",
    description: "List architecture systems.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "read_system",
    description: "Read an architecture system by id.",
    parameters: {
      type: "object",
      properties: { id: str("System id.") },
      required: ["id"],
    },
  },
  {
    name: "create_system",
    description: "Create an architecture system.",
    parameters: {
      type: "object",
      properties: {
        name: str("System name."),
        description: str("What it does."),
        category: str("Category, e.g. module, service, data (default: module)."),
        status: enumOf(["planned", "active", "deprecated"], "Status (default: active)."),
        health: num("Health 0-100 (default 100)."),
        dependencies: strArr("Names or ids of systems this depends on."),
      },
      required: ["name"],
    },
  },
  {
    name: "update_system",
    description: "Update an architecture system.",
    parameters: {
      type: "object",
      properties: {
        id: str("System id."),
        name: str("New name."),
        description: str("New description."),
        category: str("New category."),
        status: enumOf(["planned", "active", "deprecated"], "New status."),
        health: num("New health 0-100."),
        dependencies: strArr("Replacement dependency list."),
      },
      required: ["id"],
    },
  },

  /* ── Knowledge graph: links ────────────────────────────────────────── */
  {
    name: "list_links",
    description:
      "List knowledge-graph links (optionally only those from/to a given entity).",
    parameters: {
      type: "object",
      properties: {
        fromType: str("Only links from this entity kind."),
        fromId: str("Only links from this entity id."),
        toType: str("Only links to this entity kind."),
        toId: str("Only links to this entity id."),
      },
    },
  },
  {
    name: "create_link",
    description:
      "Create a knowledge-graph link between two entities (e.g. a task that implements a spec).",
    parameters: {
      type: "object",
      properties: {
        sourceType: enumOf(
          ["note", "spec", "task", "system", "commit", "memory", "doc", "archNode"],
          "Source entity kind.",
        ),
        sourceId: str("Source entity id."),
        targetType: enumOf(
          ["note", "spec", "task", "system", "commit", "memory", "doc", "archNode"],
          "Target entity kind.",
        ),
        targetId: str("Target entity id."),
        linkType: enumOf(
          ["wikilink", "dependency", "reference", "implements", "relates"],
          "Link type (default: reference).",
        ),
        label: str("Optional label."),
      },
      required: ["sourceType", "sourceId", "targetType", "targetId"],
    },
  },
  {
    name: "remove_link",
    description: "Remove a knowledge-graph link by id.",
    parameters: {
      type: "object",
      properties: { id: str("Link id.") },
      required: ["id"],
    },
  },

  /* ── Documentation ─────────────────────────────────────────────────── */
  {
    name: "read_doc",
    description: "Read a documentation page's full body by id or exact title.",
    parameters: {
      type: "object",
      properties: {
        id: str("Doc id."),
        title: str("Exact doc title (case-insensitive)."),
      },
    },
  },
  {
    name: "create_doc",
    description: "Create a documentation page (markdown).",
    parameters: {
      type: "object",
      properties: {
        title: str("Doc title."),
        body: str("Markdown body."),
        category: str("Category, e.g. guides, api, systems (default: general)."),
      },
      required: ["title", "body"],
    },
  },
  {
    name: "update_doc",
    description: "Update a documentation page.",
    parameters: {
      type: "object",
      properties: {
        id: str("Doc id."),
        title: str("New title."),
        body: str("Replacement markdown body."),
        appendBody: str("Markdown appended to the existing body."),
        category: str("New category."),
      },
      required: ["id"],
    },
  },

  /* ── Dev logs ──────────────────────────────────────────────────────── */
  {
    name: "list_devlogs",
    description: "List recent dev-log entries.",
    parameters: {
      type: "object",
      properties: { limit: num("Max results (default 20).") },
    },
  },
  {
    name: "read_devlog",
    description: "Read a dev-log entry by id.",
    parameters: {
      type: "object",
      properties: { id: str("Dev-log id.") },
      required: ["id"],
    },
  },
  {
    name: "create_devlog",
    description:
      "Write a dev-log entry recording what happened (a change, decision, or milestone).",
    parameters: {
      type: "object",
      properties: {
        title: str("One-line summary."),
        body: str("Details (markdown)."),
      },
      required: ["title"],
    },
  },
  {
    name: "update_devlog",
    description: "Update a dev-log entry's title or body.",
    parameters: {
      type: "object",
      properties: {
        id: str("Dev-log id."),
        title: str("New title."),
        body: str("New body."),
      },
      required: ["id"],
    },
  },

  /* ── Memories ──────────────────────────────────────────────────────── */
  {
    name: "list_memories",
    description: "List long-term memories, highest weight first.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "read_memory",
    description: "Read a memory by id.",
    parameters: {
      type: "object",
      properties: { id: str("Memory id.") },
      required: ["id"],
    },
  },
  {
    name: "create_memory",
    description:
      "Save a long-term memory (fact, lesson, decision, or preference) that future AI sessions should know.",
    parameters: {
      type: "object",
      properties: {
        content: str("The memory content — one crisp fact."),
        type: enumOf(["fact", "lesson", "decision", "preference"], "Memory type."),
        tags: strArr("Tags."),
        weight: num("Importance 0-1 (default 0.5)."),
      },
      required: ["content"],
    },
  },
  {
    name: "update_memory",
    description: "Update a memory's content, type, tags, or weight.",
    parameters: {
      type: "object",
      properties: {
        id: str("Memory id."),
        content: str("New content."),
        type: enumOf(["fact", "lesson", "decision", "preference"], "New type."),
        tags: strArr("Replacement tags."),
        weight: num("New importance 0-1."),
      },
      required: ["id"],
    },
  },

  /* ── Commits (read + annotate) ─────────────────────────────────────── */
  {
    name: "list_commits",
    description: "List recent commits (newest first).",
    parameters: {
      type: "object",
      properties: { limit: num("Max results (default 15).") },
    },
  },
  {
    name: "read_commit",
    description: "Read a commit by id.",
    parameters: {
      type: "object",
      properties: { id: str("Commit id.") },
      required: ["id"],
    },
  },
  {
    name: "update_commit",
    description:
      "Annotate a commit: set the AI summary or link it to specs/tasks.",
    parameters: {
      type: "object",
      properties: {
        id: str("Commit id."),
        aiSummary: str("AI-generated summary of the commit."),
        linkedSpecIds: strArr("Replacement spec links."),
        linkedTaskIds: strArr("Replacement task links."),
      },
      required: ["id"],
    },
  },

  /* ── Config / pipeline (read-only) ─────────────────────────────────── */
  {
    name: "list_files",
    description:
      "List vault files & attachments tracked by the sync engine (images, media, docs).",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "list_agents",
    description: "List configured AI agents and their roles.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "read_agent",
    description: "Read an AI agent's configuration by id.",
    parameters: {
      type: "object",
      properties: { id: str("Agent id.") },
      required: ["id"],
    },
  },
  {
    name: "list_agent_runs",
    description: "List recent agent runs for the project.",
    parameters: {
      type: "object",
      properties: { limit: num("Max results (default 15).") },
    },
  },
  {
    name: "read_workflow_state",
    description:
      "Read the 16-step workflow runs and each step's status for the project.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "list_plugins",
    description: "List installed plugins and their enabled state.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "list_sync_files",
    description: "List the project's synced file index (paths + sync status).",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "list_watch_events",
    description: "List recent project-watcher file-change events.",
    parameters: {
      type: "object",
      properties: { limit: num("Max results (default 20).") },
    },
  },
];

/** Look up tool definitions by name. */
export function getToolDef(name: string): WorkspaceToolDef | undefined {
  return WORKSPACE_TOOLS.find((t) => t.name === name);
}

function ok(data: unknown): string {
  return JSON.stringify({ ok: true, ...(typeof data === "object" && data !== null ? data : { result: data }) });
}
function fail(message: string): string {
  return JSON.stringify({ ok: false, error: message });
}

async function nextSpecNumber(projectId: string): Promise<string> {
  const specs = await specsRepo.listByProject(projectId);
  const max = specs.reduce((acc, s) => {
    const m = /(\d+)\s*$/.exec(s.number);
    return m ? Math.max(acc, parseInt(m[1], 10)) : acc;
  }, 0);
  return `RFC-${String(max + 1).padStart(3, "0")}`;
}

/**
 * refType is constrained to the entity kinds the dev-log schema accepts.
 * Non-entity creations (canvas/folder/template/link/sprint/plugin/sync/watch)
 * pass null so the log still records the action without a dangling reference.
 */
async function logAgentAction(
  projectId: string,
  title: string,
  refType: EntityKind | null,
  refId: string | null,
  body = "",
): Promise<void> {
  await devLogsRepo.create({
    projectId,
    type: "agent",
    title,
    body,
    refType,
    refId,
  });
}

/** Parse an ISO date string to epoch ms, or null when blank/invalid. */
function parseDate(v: string | undefined): number | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

/**
 * Execute one tool call against the workspace. Always resolves to a JSON
 * string (never throws) so the result can be handed straight back to the
 * model as a tool result.
 */
export async function executeWorkspaceTool(
  projectId: string,
  call: ToolCallRequest,
): Promise<string> {
  const a = call.arguments ?? {};
  const s = (k: string): string | undefined =>
    typeof a[k] === "string" && (a[k] as string).trim() ? (a[k] as string) : undefined;
  const arr = (k: string): string[] | undefined =>
    Array.isArray(a[k]) ? (a[k] as unknown[]).map(String) : undefined;
  const n = (k: string): number | undefined =>
    typeof a[k] === "number" && Number.isFinite(a[k]) ? (a[k] as number) : undefined;
  const bool = (k: string): boolean | undefined =>
    typeof a[k] === "boolean" ? (a[k] as boolean) : undefined;

  try {
    switch (call.name) {
      case "search_workspace": {
        const query = s("query");
        if (!query) return fail("query is required");
        const limit = Math.min(Math.max(n("limit") ?? 10, 1), 25);
        const items = await buildSearchItems(projectId);

        // Try the local AI service's real vector search first; fall back to
        // Fuse fuzzy search when it's unavailable or returns nothing.
        let ranked: SearchItem[] | null = null;
        try {
          const res = await fetch("/api/python/search", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ projectId, query, limit }),
            signal: AbortSignal.timeout(4000),
          });
          const data = (await res.json()) as {
            ok?: boolean;
            results?: { id: string; kind: string }[];
          };
          if (data.ok && data.results?.length) {
            const byKey = new Map(items.map((it) => [`${it.kind}:${it.id}`, it]));
            ranked = data.results
              .map((r) => byKey.get(`${r.kind}:${r.id}`))
              .filter((it): it is SearchItem => Boolean(it));
          }
        } catch {
          ranked = null;
        }
        if (!ranked || ranked.length === 0) {
          const index = createSearchIndex(items);
          ranked = index.search(query).slice(0, limit).map((r) => r.item);
        }

        const results = ranked.slice(0, limit).map((item) => ({
          kind: item.kind,
          id: item.id,
          title: item.title,
          subtitle: item.subtitle,
          snippet: item.body.slice(0, 200),
        }));
        return ok({ results });
      }

      /* ── Brain: notes ─────────────────────────────────────────────── */
      case "read_note": {
        const id = s("id");
        const title = s("title");
        const note = id
          ? await notesRepo.get(id)
          : title
            ? await notesRepo.getByTitle(projectId, title)
            : undefined;
        if (!note) return fail("Note not found");
        return ok({
          note: {
            id: note.id,
            title: note.title,
            type: note.type,
            tags: note.tags,
            folderId: note.folderId,
            body: note.body,
            updatedAt: new Date(note.updatedAt).toISOString(),
          },
        });
      }

      case "create_note": {
        const title = s("title");
        const body = s("body") ?? "";
        if (!title) return fail("title is required");
        const parsedType = noteTypeSchema.safeParse(a.type);
        const note = await notesRepo.create({
          projectId,
          title,
          body,
          type: parsedType.success ? parsedType.data : "note",
          tags: arr("tags") ?? [],
          folderId: s("folderId") ?? null,
        });
        await logAgentAction(projectId, `AI created note "${title}"`, "note", note.id);
        return ok({ id: note.id, title: note.title });
      }

      case "update_note": {
        const id = s("id");
        if (!id) return fail("id is required");
        const existing = await notesRepo.get(id);
        if (!existing) return fail("Note not found");
        const append = s("appendBody");
        const patch: Parameters<typeof notesRepo.update>[1] = {};
        if (s("title")) patch.title = s("title");
        if (s("body") !== undefined) patch.body = s("body");
        if (append) patch.body = `${existing.body.trimEnd()}\n\n${append}`;
        if (arr("tags")) patch.tags = arr("tags");
        if (s("folderId") !== undefined) patch.folderId = s("folderId") ?? null;
        await notesRepo.update(id, patch);
        await logAgentAction(projectId, `AI updated note "${patch.title ?? existing.title}"`, "note", id);
        return ok({ id });
      }

      /* ── Brain: templates ─────────────────────────────────────────── */
      case "list_note_templates": {
        const templates = await noteTemplatesRepo.listByProject(projectId);
        return ok({
          templates: templates.map((t) => ({
            id: t.id,
            name: t.name,
            type: t.type,
            description: t.description,
          })),
        });
      }

      case "read_note_template": {
        const id = s("id");
        if (!id) return fail("id is required");
        const t = await noteTemplatesRepo.get(id);
        if (!t) return fail("Template not found");
        return ok({
          template: {
            id: t.id,
            name: t.name,
            type: t.type,
            description: t.description,
            body: t.body,
            tags: t.tags,
          },
        });
      }

      /* ── Brain: canvas ────────────────────────────────────────────── */
      case "list_canvases": {
        const canvases = await canvasRepo.listByProject(projectId);
        return ok({
          canvases: canvases.map((c) => ({
            id: c.id,
            name: c.name,
            description: c.description,
            updatedAt: c.updatedAt,
          })),
        });
      }

      case "read_canvas": {
        const id = s("id");
        if (!id) return fail("id is required");
        const canvas = await canvasRepo.get(id);
        if (!canvas) return fail("Canvas not found");
        const [nodes, edges] = await Promise.all([
          canvasRepo.nodes(id),
          canvasRepo.edges(id),
        ]);
        return ok({
          canvas: { ...canvas, nodes: nodes.length, edges: edges.length },
          nodeSummaries: nodes.map((nd) => ({
            id: nd.id,
            type: nd.type,
            data: nd.data,
          })),
        });
      }

      case "create_canvas": {
        const name = s("name");
        if (!name) return fail("name is required");
        const canvas = await canvasRepo.create({
          projectId,
          name,
          description: s("description") ?? "",
        });
        await logAgentAction(projectId, `AI created canvas "${name}"`, null, canvas.id);
        return ok({ id: canvas.id, name: canvas.name });
      }

      case "update_canvas": {
        const id = s("id");
        if (!id) return fail("id is required");
        const existing = await canvasRepo.get(id);
        if (!existing) return fail("Canvas not found");
        const patch: Partial<Canvas> = {};
        if (s("name")) patch.name = s("name");
        if (s("description") !== undefined) patch.description = s("description");
        await canvasRepo.update(id, patch);
        await logAgentAction(
          projectId,
          `AI updated canvas "${patch.name ?? existing.name}"`,
          null,
          id,
        );
        return ok({ id });
      }

      /* ── Brain: folders ───────────────────────────────────────────── */
      case "list_folders": {
        const folders = await foldersRepo.listByProject(projectId);
        return ok({
          folders: folders.map((f) => ({
            id: f.id,
            name: f.name,
            parentId: f.parentId,
          })),
        });
      }

      case "create_folder": {
        const name = s("name");
        if (!name) return fail("name is required");
        const folder = await foldersRepo.create({
          projectId,
          name,
          parentId: s("parentId") ?? null,
        });
        await logAgentAction(projectId, `AI created folder "${name}"`, null, folder.id);
        return ok({ id: folder.id, name: folder.name });
      }

      case "update_folder": {
        const id = s("id");
        if (!id) return fail("id is required");
        const existing = await foldersRepo.listByProject(projectId);
        const folder = existing.find((f) => f.id === id);
        if (!folder) return fail("Folder not found");
        const patch: Partial<Folder> = {};
        if (s("name")) patch.name = s("name");
        if (a.parentId !== undefined) {
          patch.parentId = a.parentId === null ? null : s("parentId") ?? null;
        }
        await foldersRepo.update(id, patch);
        await logAgentAction(
          projectId,
          `AI updated folder "${patch.name ?? folder.name}"`,
          null,
          id,
        );
        return ok({ id });
      }

      /* ── Specs ────────────────────────────────────────────────────── */
      case "read_spec": {
        const id = s("id");
        const number = s("number");
        let spec: Spec | undefined;
        if (id) spec = await specsRepo.get(id);
        else if (number) {
          const all = await specsRepo.listByProject(projectId);
          spec = all.find(
            (x) => x.number.toLowerCase() === number.toLowerCase(),
          );
        }
        if (!spec) return fail("Spec not found");
        return ok({ spec });
      }

      case "create_spec": {
        const title = s("title");
        const purpose = s("purpose");
        if (!title || !purpose) return fail("title and purpose are required");
        const status = specStatusSchema.safeParse(a.status);
        const spec = await specsRepo.create({
          projectId,
          number: await nextSpecNumber(projectId),
          title,
          purpose,
          status: status.success ? status.data : "draft",
          goals: arr("goals") ?? [],
          features: arr("features") ?? [],
          constraints: arr("constraints") ?? [],
          dependencies: arr("dependencies") ?? [],
          acceptance: arr("acceptance") ?? [],
          risks: arr("risks") ?? [],
          technicalNotes: s("technicalNotes") ?? "",
        });
        await logAgentAction(projectId, `AI created spec ${spec.number} "${title}"`, "spec", spec.id);
        return ok({ id: spec.id, number: spec.number, title: spec.title });
      }

      case "update_spec": {
        const id = s("id");
        if (!id) return fail("id is required");
        const existing = await specsRepo.get(id);
        if (!existing) return fail("Spec not found");
        const patch: Partial<Spec> = {};
        const status = specStatusSchema.safeParse(a.status);
        if (status.success) patch.status = status.data;
        if (s("title")) patch.title = s("title");
        if (s("purpose") !== undefined) patch.purpose = s("purpose");
        if (arr("goals")) patch.goals = arr("goals");
        if (arr("features")) patch.features = arr("features");
        if (arr("constraints")) patch.constraints = arr("constraints");
        if (arr("acceptance")) patch.acceptance = arr("acceptance");
        if (arr("risks")) patch.risks = arr("risks");
        if (s("technicalNotes") !== undefined)
          patch.technicalNotes = s("technicalNotes");
        await specsRepo.update(id, patch);
        await logAgentAction(
          projectId,
          `AI updated spec ${existing.number} "${patch.title ?? existing.title}"`,
          "spec",
          id,
        );
        return ok({ id });
      }

      /* ── Standards ────────────────────────────────────────────────── */
      case "list_standards": {
        const category = s("category");
        let standards = await standardsRepo.listByProject(projectId);
        if (category) standards = standards.filter((x) => x.category === category);
        return ok({
          standards: standards.map((x) => ({
            id: x.id,
            title: x.title,
            category: x.category,
            enforced: x.enforced,
            rule: x.rule.slice(0, 300),
          })),
        });
      }

      case "read_standard": {
        const id = s("id");
        if (!id) return fail("id is required");
        const standard = await standardsRepo.get(id);
        if (!standard) return fail("Standard not found");
        return ok({ standard });
      }

      case "create_standard": {
        const title = s("title");
        const rule = s("rule") ?? "";
        if (!title) return fail("title is required");
        const cat = standardCategorySchema.safeParse(a.category);
        const standard = await standardsRepo.create({
          projectId,
          title,
          rule,
          category: cat.success ? cat.data : "other",
          examples: arr("examples") ?? [],
          enforced: bool("enforced") ?? true,
          pattern: s("pattern") ?? "",
        });
        await logAgentAction(projectId, `AI created standard "${title}"`, null, standard.id);
        return ok({ id: standard.id, title: standard.title });
      }

      case "update_standard": {
        const id = s("id");
        if (!id) return fail("id is required");
        const existing = await standardsRepo.get(id);
        if (!existing) return fail("Standard not found");
        const patch: Partial<Standard> = {};
        const cat = standardCategorySchema.safeParse(a.category);
        if (cat.success) patch.category = cat.data;
        if (s("title")) patch.title = s("title");
        if (s("rule") !== undefined) patch.rule = s("rule");
        if (arr("examples")) patch.examples = arr("examples");
        if (bool("enforced") !== undefined) patch.enforced = bool("enforced")!;
        if (s("pattern") !== undefined) patch.pattern = s("pattern");
        await standardsRepo.update(id, patch);
        await logAgentAction(
          projectId,
          `AI updated standard "${patch.title ?? existing.title}"`,
          null,
          id,
        );
        return ok({ id });
      }

      /* ── Tasks ────────────────────────────────────────────────────── */
      case "list_tasks": {
        const status = s("status");
        let tasks = await tasksRepo.listByProject(projectId);
        if (status) tasks = tasks.filter((t) => t.status === status);
        return ok({
          tasks: tasks.map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            priority: t.priority,
            assignee: t.assignee,
            progress: t.progress,
            specId: t.specId,
            sprintId: t.sprintId,
            description: t.description.slice(0, 300),
          })),
        });
      }

      case "create_task": {
        const title = s("title");
        if (!title) return fail("title is required");
        let specId: string | null = null;
        const specNumber = s("specNumber");
        if (specNumber) {
          const all = await specsRepo.listByProject(projectId);
          specId =
            all.find((x) => x.number.toLowerCase() === specNumber.toLowerCase())
              ?.id ?? null;
        }
        const status = taskStatusSchema.safeParse(a.status);
        const priority = taskPrioritySchema.safeParse(a.priority);
        const assignee = assigneeSchema.safeParse(a.assignee);
        const task = await tasksRepo.create({
          projectId,
          title,
          description: s("description") ?? "",
          status: status.success ? status.data : "todo",
          priority: priority.success ? priority.data : "medium",
          assignee: assignee.success ? assignee.data : "human",
          specId,
          sprintId: s("sprintId") ?? null,
          tags: arr("tags") ?? [],
        });
        if (specId) await specsRepo.recomputeProgress(specId);
        await logAgentAction(projectId, `AI created task "${title}"`, "task", task.id);
        return ok({ id: task.id, title: task.title, status: task.status });
      }

      case "update_task": {
        const id = s("id");
        if (!id) return fail("id is required");
        const existing = await tasksRepo.get(id);
        if (!existing) return fail("Task not found");
        const patch: Partial<Task> = {};
        const status = taskStatusSchema.safeParse(a.status);
        const priority = taskPrioritySchema.safeParse(a.priority);
        const assignee = assigneeSchema.safeParse(a.assignee);
        if (status.success) patch.status = status.data;
        if (priority.success) patch.priority = priority.data;
        if (assignee.success) patch.assignee = assignee.data;
        if (n("progress") !== undefined)
          patch.progress = Math.min(100, Math.max(0, n("progress")!));
        if (s("description") !== undefined) patch.description = s("description");
        if (s("title")) patch.title = s("title");
        if (a.sprintId !== undefined) {
          patch.sprintId = a.sprintId === null ? null : s("sprintId") ?? null;
        }
        if (patch.status === "done" && patch.progress === undefined)
          patch.progress = 100;
        await tasksRepo.update(id, patch);
        if (existing.specId) await specsRepo.recomputeProgress(existing.specId);
        await logAgentAction(
          projectId,
          `AI updated task "${patch.title ?? existing.title}"${patch.status ? ` → ${patch.status}` : ""}`,
          "task",
          id,
        );
        return ok({ id });
      }

      /* ── Sprints ──────────────────────────────────────────────────── */
      case "list_sprints": {
        const sprints = await sprintsRepo.listByProject(projectId);
        return ok({
          sprints: sprints.map((sp) => ({
            id: sp.id,
            name: sp.name,
            goal: sp.goal,
            status: sp.status,
            startDate: sp.startDate,
            endDate: sp.endDate,
          })),
        });
      }

      case "read_sprint": {
        const id = s("id");
        if (!id) return fail("id is required");
        const sprint = await sprintsRepo.get(id);
        if (!sprint) return fail("Sprint not found");
        const tasks = (await tasksRepo.listByProject(projectId)).filter(
          (t) => t.sprintId === id,
        );
        return ok({
          sprint,
          taskCount: tasks.length,
          tasks: tasks.map((t) => ({ id: t.id, title: t.title, status: t.status })),
        });
      }

      case "create_sprint": {
        const name = s("name");
        if (!name) return fail("name is required");
        const status = ["planned", "active", "completed"].includes(String(a.status))
          ? (String(a.status) as "planned" | "active" | "completed")
          : "planned";
        const sprint = await sprintsRepo.create({
          projectId,
          name,
          goal: s("goal") ?? "",
          status,
          startDate: parseDate(s("startDate")),
          endDate: parseDate(s("endDate")),
        });
        await logAgentAction(projectId, `AI created sprint "${name}"`, null, sprint.id);
        return ok({ id: sprint.id, name: sprint.name });
      }

      case "update_sprint": {
        const id = s("id");
        if (!id) return fail("id is required");
        const existing = await sprintsRepo.get(id);
        if (!existing) return fail("Sprint not found");
        const patch: Partial<Sprint> = {};
        if (s("name")) patch.name = s("name");
        if (s("goal") !== undefined) patch.goal = s("goal");
        if (["planned", "active", "completed"].includes(String(a.status)))
          patch.status = String(a.status) as Sprint["status"];
        if (a.startDate !== undefined) patch.startDate = parseDate(s("startDate"));
        if (a.endDate !== undefined) patch.endDate = parseDate(s("endDate"));
        await sprintsRepo.update(id, patch);
        await logAgentAction(
          projectId,
          `AI updated sprint "${patch.name ?? existing.name}"`,
          null,
          id,
        );
        return ok({ id });
      }

      /* ── Systems / architecture ───────────────────────────────────── */
      case "list_systems": {
        const systems = await systemsRepo.listByProject(projectId);
        return ok({
          systems: systems.map((sy) => ({
            id: sy.id,
            name: sy.name,
            category: sy.category,
            status: sy.status,
            health: sy.health,
            dependencies: sy.dependencies,
            description: sy.description.slice(0, 200),
          })),
        });
      }

      case "read_system": {
        const id = s("id");
        if (!id) return fail("id is required");
        const system = await systemsRepo.get(id);
        if (!system) return fail("System not found");
        return ok({ system });
      }

      case "create_system": {
        const name = s("name");
        if (!name) return fail("name is required");
        const status = ["planned", "active", "deprecated"].includes(String(a.status))
          ? (String(a.status) as System["status"])
          : "active";
        const system = await systemsRepo.create({
          projectId,
          name,
          description: s("description") ?? "",
          category: s("category") ?? "module",
          status,
          health: n("health") ?? 100,
          dependencies: arr("dependencies") ?? [],
        });
        await logAgentAction(projectId, `AI created system "${name}"`, "system", system.id);
        return ok({ id: system.id, name: system.name });
      }

      case "update_system": {
        const id = s("id");
        if (!id) return fail("id is required");
        const existing = await systemsRepo.get(id);
        if (!existing) return fail("System not found");
        const patch: Partial<System> = {};
        if (s("name")) patch.name = s("name");
        if (s("description") !== undefined) patch.description = s("description");
        if (s("category") !== undefined) patch.category = s("category");
        if (["planned", "active", "deprecated"].includes(String(a.status)))
          patch.status = String(a.status) as System["status"];
        if (n("health") !== undefined)
          patch.health = Math.min(100, Math.max(0, n("health")!));
        if (arr("dependencies")) patch.dependencies = arr("dependencies");
        await systemsRepo.update(id, patch);
        await logAgentAction(
          projectId,
          `AI updated system "${patch.name ?? existing.name}"`,
          "system",
          id,
        );
        return ok({ id });
      }

      /* ── Knowledge graph: links ───────────────────────────────────── */
      case "list_links": {
        const fromType = s("fromType") as EntityKind | undefined;
        const fromId = s("fromId");
        const toType = s("toType") as EntityKind | undefined;
        const toId = s("toId");
        let links = await linksRepo.listByProject(projectId);
        if (fromType && fromId) {
          const out = await linksRepo.listBySource(fromType, fromId);
          links = links.filter((l) => out.some((o) => o.id === l.id));
        }
        if (toType && toId) {
          const inc = await linksRepo.listByTarget(toType, toId);
          links = links.filter((l) => inc.some((i) => i.id === l.id));
        }
        return ok({
          links: links.map((l) => ({
            id: l.id,
            sourceType: l.sourceType,
            sourceId: l.sourceId,
            targetType: l.targetType,
            targetId: l.targetId,
            linkType: l.linkType,
            label: l.label,
          })),
        });
      }

      case "create_link": {
        const sourceType = s("sourceType") as EntityKind | undefined;
        const sourceId = s("sourceId");
        const targetType = s("targetType") as EntityKind | undefined;
        const targetId = s("targetId");
        if (!sourceType || !sourceId || !targetType || !targetId)
          return fail("sourceType, sourceId, targetType, targetId are required");
        const linkType = (["wikilink", "dependency", "reference", "implements", "relates"]
          .includes(String(a.linkType))
          ? String(a.linkType)
          : "reference") as
          | "wikilink"
          | "dependency"
          | "reference"
          | "implements"
          | "relates";
        const link = await linksRepo.create({
          projectId,
          sourceType,
          sourceId,
          targetType,
          targetId,
          linkType,
          label: s("label") ?? "",
        });
        await logAgentAction(
          projectId,
          `AI linked ${sourceType}:${sourceId} → ${targetType}:${targetId}`,
          null,
          link.id,
        );
        return ok({ id: link.id });
      }

      case "remove_link": {
        const id = s("id");
        if (!id) return fail("id is required");
        await linksRepo.remove(id);
        return ok({ id });
      }

      /* ── Docs ─────────────────────────────────────────────────────── */
      case "read_doc": {
        const id = s("id");
        const title = s("title");
        let doc = id ? await docsRepo.get(id) : undefined;
        if (!doc && title) {
          const all = await docsRepo.listByProject(projectId);
          doc = all.find(
            (d) => d.title.trim().toLowerCase() === title.trim().toLowerCase(),
          );
        }
        if (!doc) return fail("Doc not found");
        return ok({ doc });
      }

      case "create_doc": {
        const title = s("title");
        const body = s("body");
        if (!title || !body) return fail("title and body are required");
        const doc = await docsRepo.create({
          projectId,
          title,
          body,
          category: s("category") ?? "general",
          sourceType: "auto",
        });
        await logAgentAction(projectId, `AI created doc "${title}"`, "doc", doc.id);
        return ok({ id: doc.id, title: doc.title });
      }

      case "update_doc": {
        const id = s("id");
        if (!id) return fail("id is required");
        const existing = await docsRepo.get(id);
        if (!existing) return fail("Doc not found");
        const append = s("appendBody");
        const patch: Record<string, unknown> = {};
        if (s("title")) patch.title = s("title");
        if (s("body") !== undefined) patch.body = s("body");
        if (append) patch.body = `${existing.body.trimEnd()}\n\n${append}`;
        if (s("category")) patch.category = s("category");
        await docsRepo.update(id, patch);
        await logAgentAction(projectId, `AI updated doc "${existing.title}"`, "doc", id);
        return ok({ id });
      }

      /* ── Dev logs ─────────────────────────────────────────────────── */
      case "list_devlogs": {
        const limit = Math.min(Math.max(n("limit") ?? 20, 1), 50);
        const logs = (await devLogsRepo.listByProject(projectId)).slice(0, limit);
        return ok({
          devlogs: logs.map((l) => ({
            id: l.id,
            type: l.type,
            title: l.title,
            refType: l.refType,
            refId: l.refId,
            createdAt: l.createdAt,
            body: l.body.slice(0, 200),
          })),
        });
      }

      case "read_devlog": {
        const id = s("id");
        if (!id) return fail("id is required");
        const log = await devLogsRepo.get(id);
        if (!log) return fail("Dev log not found");
        return ok({ devlog: log });
      }

      case "create_devlog": {
        const title = s("title");
        if (!title) return fail("title is required");
        const log = await devLogsRepo.create({
          projectId,
          type: "agent",
          title,
          body: s("body") ?? "",
        });
        return ok({ id: log.id });
      }

      case "update_devlog": {
        const id = s("id");
        if (!id) return fail("id is required");
        const existing = await devLogsRepo.get(id);
        if (!existing) return fail("Dev log not found");
        const patch: Partial<typeof existing> = {};
        if (s("title")) patch.title = s("title");
        if (s("body") !== undefined) patch.body = s("body");
        await devLogsRepo.update(id, patch);
        return ok({ id });
      }

      /* ── Memories ─────────────────────────────────────────────────── */
      case "list_memories": {
        const memories = [...(await memoriesRepo.listByProject(projectId))].sort(
          (x, y) => y.weight - x.weight,
        );
        return ok({
          memories: memories.map((m) => ({
            id: m.id,
            type: m.type,
            content: m.content,
            weight: m.weight,
            tags: m.tags,
          })),
        });
      }

      case "read_memory": {
        const id = s("id");
        if (!id) return fail("id is required");
        const memory = await memoriesRepo.get(id);
        if (!memory) return fail("Memory not found");
        return ok({ memory });
      }

      case "create_memory": {
        const content = s("content");
        if (!content) return fail("content is required");
        const type = ["fact", "lesson", "decision", "preference"].includes(
          String(a.type),
        )
          ? (String(a.type) as "fact" | "lesson" | "decision" | "preference")
          : "fact";
        const memory = await memoriesRepo.create({
          projectId,
          content,
          type,
          tags: arr("tags") ?? [],
          weight: Math.min(1, Math.max(0, n("weight") ?? 0.5)),
        });
        await logAgentAction(projectId, `AI saved a ${type} to memory`, "memory", memory.id, content);
        return ok({ id: memory.id });
      }

      case "update_memory": {
        const id = s("id");
        if (!id) return fail("id is required");
        const existing = await memoriesRepo.get(id);
        if (!existing) return fail("Memory not found");
        const patch: Partial<typeof existing> = {};
        if (s("content")) patch.content = s("content");
        if (["fact", "lesson", "decision", "preference"].includes(String(a.type)))
          patch.type = String(a.type) as typeof existing.type;
        if (arr("tags")) patch.tags = arr("tags");
        if (n("weight") !== undefined)
          patch.weight = Math.min(1, Math.max(0, n("weight")!));
        await memoriesRepo.update(id, patch);
        return ok({ id });
      }

      /* ── Commits ──────────────────────────────────────────────────── */
      case "list_commits": {
        const limit = Math.min(Math.max(n("limit") ?? 15, 1), 50);
        const commits = (await commitsRepo.listByProject(projectId)).slice(0, limit);
        return ok({
          commits: commits.map((c) => ({
            id: c.id,
            sha: c.sha.slice(0, 7),
            message: c.message.split("\n")[0],
            author: c.author,
            date: c.date,
            aiSummary: c.aiSummary,
          })),
        });
      }

      case "read_commit": {
        const id = s("id");
        if (!id) return fail("id is required");
        const commit = await commitsRepo.get(id);
        if (!commit) return fail("Commit not found");
        return ok({ commit });
      }

      case "update_commit": {
        const id = s("id");
        if (!id) return fail("id is required");
        const existing = await commitsRepo.get(id);
        if (!existing) return fail("Commit not found");
        const patch: Partial<Commit> = {};
        if (s("aiSummary") !== undefined) patch.aiSummary = s("aiSummary");
        if (arr("linkedSpecIds")) patch.linkedSpecIds = arr("linkedSpecIds")!;
        if (arr("linkedTaskIds")) patch.linkedTaskIds = arr("linkedTaskIds")!;
        await commitsRepo.update(id, patch);
        return ok({ id });
      }

      /* ── Config / pipeline (read-only) ────────────────────────────── */
      case "list_files": {
        const syncFiles = await syncRepo.listByProject(projectId);
        const attachments = syncFiles.filter((f) =>
          f.entityId?.startsWith("attachment:"),
        );
        return ok({
          files: attachments.map((f) => ({
            id: f.id,
            path: f.path,
            name: f.path.split("/").pop() ?? f.path,
            status: f.status,
            lastSyncedAt: f.lastSyncedAt,
          })),
          total: attachments.length,
        });
      }

      case "list_agents": {
        const agents = await agentsRepo.list();
        return ok({
          agents: agents.map((ag) => ({
            id: ag.id,
            name: ag.name,
            role: ag.role,
            description: ag.description,
            enabled: ag.enabled,
            model: ag.model,
          })),
        });
      }

      case "read_agent": {
        const id = s("id");
        if (!id) return fail("id is required");
        const agent = await agentsRepo.get(id);
        if (!agent) return fail("Agent not found");
        return ok({ agent });
      }

      case "list_agent_runs": {
        const limit = Math.min(Math.max(n("limit") ?? 15, 1), 50);
        const runs = (await agentRunsRepo.listByProject(projectId)).slice(0, limit);
        return ok({
          agentRuns: runs.map((r) => ({
            id: r.id,
            agentId: r.agentId,
            status: r.status,
            input: r.input.slice(0, 200),
            output: r.output.slice(0, 200),
            startedAt: r.startedAt,
            finishedAt: r.finishedAt,
          })),
        });
      }

      case "read_workflow_state": {
        const runs = await workflowRepo.listRuns(projectId);
        const summarized = await Promise.all(
          runs.map(async (r) => {
            const steps = await workflowRepo.listSteps(r.id);
            return {
              id: r.id,
              title: r.title,
              idea: r.idea,
              steps: steps.map((st) => ({
                stepKey: st.stepKey,
                order: st.order,
                status: st.status,
              })),
            };
          }),
        );
        return ok({ workflowRuns: summarized });
      }

      case "list_plugins": {
        const plugins = await pluginsRepo.listByProject(projectId);
        return ok({
          plugins: plugins.map((p) => ({
            id: p.id,
            pluginId: p.pluginId,
            enabled: p.enabled,
            settings: p.settings,
          })),
        });
      }

      case "list_sync_files": {
        const syncFiles = await syncRepo.listByProject(projectId);
        return ok({
          syncFiles: syncFiles.map((f) => ({
            id: f.id,
            path: f.path,
            status: f.status,
            entityType: f.entityType,
            entityId: f.entityId,
            lastSyncedAt: f.lastSyncedAt,
          })),
        });
      }

      case "list_watch_events": {
        const limit = Math.min(Math.max(n("limit") ?? 20, 1), 100);
        const events = (await watchEventsRepo.listByProject(projectId)).slice(0, limit);
        return ok({
          watchEvents: events.map((e) => ({
            id: e.id,
            path: e.path,
            kind: e.kind,
            fileType: e.fileType,
            systemId: e.systemId,
            createdAt: e.createdAt,
          })),
        });
      }

      default:
        return fail(`Unknown tool: ${call.name}`);
    }
  } catch (e) {
    return fail((e as Error).message);
  }
}
