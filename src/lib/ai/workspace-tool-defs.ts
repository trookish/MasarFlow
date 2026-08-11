/**
 * The workspace tool belt — pure metadata, no database imports.
 *
 * This module is the single source of truth for the project's functions
 * (create_note, read_spec, create_task, …). It stays free of Dexie/repo
 * imports so it can be safely consumed from server-side code too: the
 * OpenCode custom-tool generator (toolgen), the bridge routes, and the
 * system-prompt tool listings all derive from here, guaranteeing every
 * backend (OpenCode / API / Local) describes exactly the same functions.
 *
 * Execution lives in `@/lib/ai/tools` (executeWorkspaceTool), which runs in
 * the browser against the Dexie repos.
 */

/**
 * Enum option lists — duplicated from db/schema.ts ON PURPOSE: this module is
 * import-free so plain Node (scripts/install-opencode-tools.mjs, type
 * stripping) can load it to generate the opencode tool files. A unit test
 * (tests/unit/lib/ai/workspace-tool-defs.test.ts) fails if these drift from
 * the zod schemas.
 */
const NOTE_TYPES = [
  "idea",
  "system",
  "mechanic",
  "research",
  "experiment",
  "note",
  "lore",
  "decision",
] as const;
const SPEC_STATUSES = [
  "draft",
  "review",
  "approved",
  "implementing",
  "shipped",
] as const;
const STANDARD_CATEGORIES = [
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
const TASK_STATUSES = [
  "backlog",
  "todo",
  "in_progress",
  "review",
  "done",
] as const;
const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
const ASSIGNEES = [
  "human",
  "ai",
  "architect",
  "programmer",
  "reviewer",
  "tester",
  "documenter",
  "designer",
  "optimizer",
] as const;

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
    description: "Read a brain note's full markdown body by id or exact title.",
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
        type: enumOf(NOTE_TYPES, "Note type (default: note)."),
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
    description:
      "Read a full specification by id or RFC number (e.g. RFC-001).",
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
        status: enumOf(SPEC_STATUSES, "Status (default: draft)."),
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
        status: enumOf(SPEC_STATUSES, "New status."),
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
        category: enumOf(STANDARD_CATEGORIES, "Filter by category."),
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
        category: enumOf(STANDARD_CATEGORIES, "Category (default: other)."),
        examples: strArr("Good/bad examples."),
        enforced: {
          type: "boolean",
          description: "Machine-enforced (default true).",
        },
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
        category: enumOf(STANDARD_CATEGORIES, "New category."),
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
        status: enumOf(TASK_STATUSES, "Filter by status."),
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
        status: enumOf(TASK_STATUSES, "Initial status (default: todo)."),
        priority: enumOf(TASK_PRIORITIES, "Priority (default: medium)."),
        assignee: enumOf(ASSIGNEES, "Who works it (default: human)."),
        specNumber: str("Link to a spec by number, e.g. RFC-001."),
        sprintId: str("Link to a sprint by id."),
        tags: strArr("Tags."),
      },
      required: ["title"],
    },
  },
  {
    name: "update_task",
    description:
      "Update a task's status, progress, priority, assignee, or description.",
    parameters: {
      type: "object",
      properties: {
        id: str("Task id (find it via list_tasks or search_workspace)."),
        status: enumOf(TASK_STATUSES, "New status."),
        priority: enumOf(TASK_PRIORITIES, "New priority."),
        assignee: enumOf(ASSIGNEES, "New assignee."),
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
        status: enumOf(
          ["planned", "active", "completed"],
          "Status (default planned).",
        ),
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
        category: str(
          "Category, e.g. module, service, data (default: module).",
        ),
        status: enumOf(
          ["planned", "active", "deprecated"],
          "Status (default: active).",
        ),
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
          [
            "note",
            "spec",
            "task",
            "system",
            "commit",
            "memory",
            "doc",
            "archNode",
          ],
          "Source entity kind.",
        ),
        sourceId: str("Source entity id."),
        targetType: enumOf(
          [
            "note",
            "spec",
            "task",
            "system",
            "commit",
            "memory",
            "doc",
            "archNode",
          ],
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
        category: str(
          "Category, e.g. guides, api, systems (default: general).",
        ),
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
        type: enumOf(
          ["fact", "lesson", "decision", "preference"],
          "Memory type.",
        ),
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

/** Every workspace function name — cheap, importable server-side too. */
export const WORKSPACE_TOOL_NAMES: readonly string[] = WORKSPACE_TOOLS.map(
  (t) => t.name,
);
