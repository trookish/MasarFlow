import {
  notesRepo,
  specsRepo,
  tasksRepo,
  sprintsRepo,
  docsRepo,
  devLogsRepo,
  memoriesRepo,
} from "@/lib/db/repos";
import {
  taskStatusSchema,
  taskPrioritySchema,
  assigneeSchema,
  noteTypeSchema,
  specStatusSchema,
  type Spec,
  type Task,
} from "@/lib/db/schema";
import { buildSearchItems, createSearchIndex } from "@/lib/utils/search";

/**
 * The workspace tool belt: real function-calling tools the AI uses to read
 * and mutate the local database. Definitions use provider-neutral JSON Schema
 * (converted to OpenAI/Anthropic shapes by /api/chat); execution runs in the
 * browser against the Dexie repos, and every mutation writes a dev-log entry
 * so the trail is visible in Dev Logs.
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
      },
      required: ["id"],
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
      },
      required: ["id"],
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

async function logAgentAction(
  projectId: string,
  title: string,
  refType: "note" | "spec" | "task" | "doc" | "memory" | null,
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

  try {
    switch (call.name) {
      case "search_workspace": {
        const query = s("query");
        if (!query) return fail("query is required");
        const items = await buildSearchItems(projectId);
        const index = createSearchIndex(items);
        const limit = Math.min(Math.max(n("limit") ?? 10, 1), 25);
        const results = index.search(query).slice(0, limit).map((r) => ({
          kind: r.item.kind,
          id: r.item.id,
          title: r.item.title,
          subtitle: r.item.subtitle,
          snippet: r.item.body.slice(0, 200),
        }));
        return ok({ results });
      }

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
            body: note.body,
            updatedAt: new Date(note.updatedAt).toISOString(),
          },
        });
      }

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
            description: t.description.slice(0, 300),
          })),
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
        await notesRepo.update(id, patch);
        await logAgentAction(projectId, `AI updated note "${patch.title ?? existing.title}"`, "note", id);
        return ok({ id });
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

      case "create_sprint": {
        const name = s("name");
        if (!name) return fail("name is required");
        const parse = (k: string): number | null => {
          const v = s(k);
          if (!v) return null;
          const t = Date.parse(v);
          return Number.isNaN(t) ? null : t;
        };
        const status = ["planned", "active", "completed"].includes(String(a.status))
          ? (String(a.status) as "planned" | "active" | "completed")
          : "planned";
        const sprint = await sprintsRepo.create({
          projectId,
          name,
          goal: s("goal") ?? "",
          status,
          startDate: parse("startDate"),
          endDate: parse("endDate"),
        });
        await logAgentAction(projectId, `AI created sprint "${name}"`, null, sprint.id);
        return ok({ id: sprint.id, name: sprint.name });
      }

      default:
        return fail(`Unknown tool: ${call.name}`);
    }
  } catch (e) {
    return fail((e as Error).message);
  }
}
