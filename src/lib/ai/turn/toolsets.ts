import { FS_TOOLS, FS_TOOL_NAMES } from "@/lib/ai/fs-tools";
import {
  getToolDef,
  type ToolCallRequest,
  type WorkspaceToolDef,
} from "@/lib/ai/workspace-tool-defs";

/**
 * Coarse tool sets (v0.3 P4 T3). The model sees about ten tools with a `kind` discriminator instead of
 * the 61 per-entity workspace tools. Each coarse call is expanded back into the legacy tool call
 * before it runs, so the executor, its validation and the undo ledger are unchanged, and threads
 * stored with the old names still replay (the legacy names stay accepted for 0.3; removed in 0.4).
 */

export type ToolsetId = "none" | "workspace";

/** Entity kinds each coarse verb accepts, mapped to the legacy tool that implements it. */
const LIST: Record<string, string> = {
  canvas: "list_canvases",
  folder: "list_folders",
  standard: "list_standards",
  task: "list_tasks",
  sprint: "list_sprints",
  system: "list_systems",
  link: "list_links",
  devlog: "list_devlogs",
  memory: "list_memories",
  commit: "list_commits",
  file: "list_files",
  agent: "list_agents",
  agent_run: "list_agent_runs",
  note_template: "list_note_templates",
  feature: "list_plugins",
  sync_file: "list_sync_files",
  watch_event: "list_watch_events",
  activity: "list_activity",
};
const READ: Record<string, string> = {
  note: "read_note",
  canvas: "read_canvas",
  spec: "read_spec",
  standard: "read_standard",
  sprint: "read_sprint",
  system: "read_system",
  doc: "read_doc",
  devlog: "read_devlog",
  memory: "read_memory",
  commit: "read_commit",
  agent: "read_agent",
  note_template: "read_note_template",
};
const CREATE: Record<string, string> = {
  note: "create_note",
  canvas: "create_canvas",
  folder: "create_folder",
  spec: "create_spec",
  standard: "create_standard",
  task: "create_task",
  sprint: "create_sprint",
  system: "create_system",
  doc: "create_doc",
  devlog: "create_devlog",
  memory: "create_memory",
};
const UPDATE: Record<string, string> = {
  note: "update_note",
  canvas: "update_canvas",
  folder: "update_folder",
  spec: "update_spec",
  standard: "update_standard",
  task: "update_task",
  sprint: "update_sprint",
  system: "update_system",
  doc: "update_doc",
  devlog: "update_devlog",
  memory: "update_memory",
  commit: "update_commit",
};
const CONTEXT: Record<string, string> = {
  active: "get_active_context",
  backlinks: "get_backlinks",
  git_status: "git_status",
  workflow_state: "read_workflow_state",
  open: "open_entity",
};
const FS: Record<string, string> = {
  list_files: "fs_list",
  read_file: "fs_read",
  search_files: "fs_search",
  write_file: "fs_write",
  run_command: "shell_run",
};

/** `kind: field, field` lines for a verb, taken from the legacy schemas so they never drift. */
function fieldsDoc(map: Record<string, string>, skip: string[] = []): string {
  return Object.entries(map)
    .map(([kind, name]) => {
      const props = Object.keys(
        ((getToolDef(name)?.parameters ?? {}) as { properties?: object })
          .properties ?? {},
      );
      const shown = props.filter((p) => !skip.includes(p));
      return `${kind}: ${shown.join(", ") || "-"}`;
    })
    .join("; ");
}

const kindParam = (map: Record<string, string>, description: string) => ({
  type: "string",
  enum: Object.keys(map),
  description,
});

function workspaceTools(): WorkspaceToolDef[] {
  const search = getToolDef("search_workspace");
  return [
    ...(search ? [search] : []),
    {
      name: "list_entities",
      description:
        "List workspace records of one kind. Optional filters per kind: " +
        fieldsDoc(LIST),
      parameters: {
        type: "object",
        properties: {
          kind: kindParam(LIST, "What to list"),
          filters: { type: "object" },
        },
        required: ["kind"],
      },
    },
    {
      name: "read_entity",
      description:
        "Read one record in full. Identify it with: " + fieldsDoc(READ),
      parameters: {
        type: "object",
        properties: {
          kind: kindParam(READ, "Record kind"),
          id: { type: "string" },
          fields: {
            type: "object",
            description: "Other identifying fields, such as a spec number",
          },
        },
        required: ["kind"],
      },
    },
    {
      name: "create_entity",
      description: "Create a record. Fields per kind: " + fieldsDoc(CREATE),
      parameters: {
        type: "object",
        properties: {
          kind: kindParam(CREATE, "Record kind"),
          fields: { type: "object" },
        },
        required: ["kind", "fields"],
      },
    },
    {
      name: "update_entity",
      description:
        "Update a record; only the given fields change. Fields per kind: " +
        fieldsDoc(UPDATE, ["id"]),
      parameters: {
        type: "object",
        properties: {
          kind: kindParam(UPDATE, "Record kind"),
          id: { type: "string" },
          fields: { type: "object" },
        },
        required: ["kind", "id", "fields"],
      },
    },
    {
      name: "link_entities",
      description:
        "Create a link between two records (fields: " +
        fieldsDoc({ link: "create_link" }).slice(6) +
        "), or remove one by id.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["create", "remove"] },
          id: { type: "string" },
          fields: { type: "object" },
        },
        required: ["action"],
      },
    },
    {
      name: "workspace_context",
      description:
        "Read live context: active (current project and selection), backlinks (needs id), git_status, workflow_state, or open (show a record to the user; needs kind and id).",
      parameters: {
        type: "object",
        properties: {
          topic: kindParam(CONTEXT, "What to read"),
          id: { type: "string" },
          kind: { type: "string" },
        },
        required: ["topic"],
      },
    },
  ];
}

function fsTools(): WorkspaceToolDef[] {
  const out: WorkspaceToolDef[] = [];
  for (const [name, legacy] of Object.entries(FS)) {
    const def = FS_TOOLS.find((t) => t.name === legacy);
    if (def) out.push({ ...def, name });
  }
  return out;
}

/** The tools offered for a toolset. File tools only appear when the project has a linked folder. */
export function toolsFor(
  toolset: ToolsetId,
  opts: { hasLinkedRoot: boolean },
): WorkspaceToolDef[] {
  if (toolset === "none") return [];
  return opts.hasLinkedRoot
    ? [...workspaceTools(), ...fsTools()]
    : workspaceTools();
}

/** Byte size of the schema payload, for the budget test and the developer panel. */
export function toolsetPayloadBytes(tools: WorkspaceToolDef[]): number {
  return JSON.stringify(tools).length;
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

/** The result of expanding a coarse call: the legacy call to run, or an error for the model. */
export type Expanded =
  { ok: true; call: ToolCallRequest } | { ok: false; error: string };

/**
 * Translate a coarse call to the legacy call that implements it. Legacy names pass through
 * unchanged (old threads and older prompts). Unknown kinds produce an error the model can read.
 */
export function expandToolCall(call: ToolCallRequest): Expanded {
  const a = obj(call.arguments);
  const kind = typeof a.kind === "string" ? a.kind : "";
  const to = (
    name: string | undefined,
    args: Record<string, unknown>,
    label: string,
  ): Expanded =>
    name
      ? { ok: true, call: { id: call.id, name, arguments: args } }
      : { ok: false, error: `Unknown ${label} "${kind || a.topic}".` };

  switch (call.name) {
    case "list_entities":
      return to(LIST[kind], obj(a.filters), "kind");
    case "read_entity":
      return to(
        READ[kind],
        { ...obj(a.fields), ...(a.id ? { id: a.id } : {}) },
        "kind",
      );
    case "create_entity":
      return to(CREATE[kind], obj(a.fields), "kind");
    case "update_entity":
      return to(UPDATE[kind], { ...obj(a.fields), id: a.id }, "kind");
    case "link_entities":
      return a.action === "remove"
        ? to("remove_link", { id: a.id }, "action")
        : to("create_link", obj(a.fields), "action");
    case "workspace_context": {
      const topic = typeof a.topic === "string" ? a.topic : "";
      const args: Record<string, unknown> = {};
      if (a.id) args.id = a.id;
      if (a.kind) args.kind = a.kind;
      return CONTEXT[topic]
        ? {
            ok: true,
            call: { id: call.id, name: CONTEXT[topic], arguments: args },
          }
        : { ok: false, error: `Unknown topic "${topic}".` };
    }
    default:
      if (FS[call.name])
        return { ok: true, call: { ...call, name: FS[call.name] } };
      return { ok: true, call };
  }
}

/** True when the (expanded) call is a file-system or shell tool. */
export function isFsCall(call: ToolCallRequest): boolean {
  return FS_TOOL_NAMES.has(call.name);
}
