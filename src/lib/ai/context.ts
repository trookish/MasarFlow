import Fuse from "fuse.js";
import {
  projectsRepo,
  notesRepo,
  specsRepo,
  tasksRepo,
  sprintsRepo,
  standardsRepo,
  systemsRepo,
  memoriesRepo,
  devLogsRepo,
  docsRepo,
  commitsRepo,
} from "@/lib/db/repos";
import type {
  Project,
  Note,
  Spec,
  Task,
  Sprint,
  Standard,
  System,
  Memory,
  DevLog,
  Doc,
  Commit,
} from "@/lib/db/schema";
import { stripMarkdown } from "@/lib/utils/markdown";

/**
 * The workspace context engine. Assembles everything the workspace knows —
 * project, notes, specs, tasks, sprints, docs, standards, systems, memories,
 * dev logs, commits — into a budgeted markdown briefing that grounds the AI
 * chat, agents, and workflow in real data.
 *
 * `formatWorkspaceContext` is pure (fetched data in, string out) so it can be
 * unit-tested without IndexedDB; `assembleWorkspaceContext` fetches from the
 * repos and delegates.
 */

export interface WorkspaceSnapshot {
  project: Project | null;
  notes: Note[];
  specs: Spec[];
  tasks: Task[];
  sprints: Sprint[];
  standards: Standard[];
  systems: System[];
  memories: Memory[];
  devLogs: DevLog[];
  docs: Doc[];
  commits: Commit[];
}

/** A query-relevant passage retrieved from the local AI service's RAG index. */
export interface RagChunk {
  entityId: string;
  kind: "note" | "doc";
  title: string;
  text: string;
  score: number;
}

export interface ContextOptions {
  /** Free-text query used to pick which note/doc bodies are inlined in full. */
  query?: string;
  /** Approximate character budget for the whole briefing. */
  budget?: number;
  /** How many of the most relevant notes/docs get their full body inlined. */
  fullBodies?: number;
  /**
   * Pre-fetched RAG chunks for note/doc retrieval. When present, these
   * replace the Fuse-based `pickFullBodies` selection — real query-relevant
   * passages instead of whichever notes fuzzy-matched the query. Fetched by
   * `assembleWorkspaceContext`; passed through here so this function stays a
   * pure formatter.
   */
  ragChunks?: RagChunk[];
  /**
   * Caller's cancellation signal — honored while retrieving RAG chunks so a
   * user hitting Stop mid-context-assembly aborts promptly instead of waiting
   * out the RAG timeout.
   */
  signal?: AbortSignal;
}

const DEFAULT_BUDGET = 28_000;
const DEFAULT_FULL_BODIES = 6;
const BODY_CLIP = 4_000;
const RAG_BUDGET_CHARS = 8_000;

/** Fetch the entire workspace for a project. */
export async function fetchWorkspaceSnapshot(
  projectId: string,
): Promise<WorkspaceSnapshot> {
  const [
    project,
    notes,
    specs,
    tasks,
    sprints,
    standards,
    systems,
    memories,
    devLogs,
    docs,
    commits,
  ] = await Promise.all([
    projectsRepo.get(projectId),
    notesRepo.listByProject(projectId),
    specsRepo.listByProject(projectId),
    tasksRepo.listByProject(projectId),
    sprintsRepo.listByProject(projectId),
    standardsRepo.listByProject(projectId),
    systemsRepo.listByProject(projectId),
    memoriesRepo.listByProject(projectId),
    devLogsRepo.listByProject(projectId),
    docsRepo.listByProject(projectId),
    commitsRepo.listByProject(projectId),
  ]);
  return {
    project: project ?? null,
    notes,
    specs,
    tasks,
    sprints,
    standards,
    systems,
    memories,
    devLogs,
    docs,
    commits,
  };
}

function clip(text: string, max: number): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function day(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

/** Pick the notes/docs whose full bodies are most worth inlining. */
function pickFullBodies(
  notes: Note[],
  docs: Doc[],
  query: string | undefined,
  count: number,
): { noteIds: Set<string>; docIds: Set<string> } {
  type Entry = {
    kind: "note" | "doc";
    id: string;
    title: string;
    body: string;
    updatedAt: number;
  };
  const entries: Entry[] = [
    ...notes.map((n) => ({
      kind: "note" as const,
      id: n.id,
      title: n.title,
      body: stripMarkdown(n.body),
      updatedAt: n.updatedAt,
    })),
    ...docs.map((d) => ({
      kind: "doc" as const,
      id: d.id,
      title: d.title,
      body: stripMarkdown(d.body),
      updatedAt: d.updatedAt,
    })),
  ].filter((e) => e.body.length > 0);

  let picked: Entry[];
  if (query?.trim()) {
    const fuse = new Fuse(entries, {
      keys: [
        { name: "title", weight: 0.6 },
        { name: "body", weight: 0.4 },
      ],
      threshold: 0.45,
      ignoreLocation: true,
    });
    picked = fuse
      .search(query)
      .slice(0, count)
      .map((r) => r.item);
    // Backfill with most recently updated when the query matches few items.
    if (picked.length < count) {
      const have = new Set(picked.map((p) => p.id));
      const recent = [...entries]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .filter((e) => !have.has(e.id));
      picked = [...picked, ...recent.slice(0, count - picked.length)];
    }
  } else {
    picked = [...entries]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, count);
  }

  const noteIds = new Set<string>();
  const docIds = new Set<string>();
  for (const p of picked) (p.kind === "note" ? noteIds : docIds).add(p.id);
  return { noteIds, docIds };
}

/**
 * Format a workspace snapshot into a markdown briefing, respecting a rough
 * character budget. Sections are appended in priority order; lower-priority
 * sections shrink or drop first.
 */
export function formatWorkspaceContext(
  snapshot: WorkspaceSnapshot,
  opts: ContextOptions = {},
): string {
  const budget = opts.budget ?? DEFAULT_BUDGET;

  // RAG chunks (when available) replace Fuse-based full-body selection with
  // real query-relevant passages, grouped back by source entity.
  let fullNoteIds: Set<string>;
  let fullDocIds: Set<string>;
  let noteChunks: Map<string, string[]> | null = null;
  let docChunks: Map<string, string[]> | null = null;
  if (opts.ragChunks?.length) {
    noteChunks = new Map();
    docChunks = new Map();
    for (const c of opts.ragChunks) {
      const target = c.kind === "doc" ? docChunks : noteChunks;
      const list = target.get(c.entityId) ?? [];
      list.push(c.text);
      target.set(c.entityId, list);
    }
    fullNoteIds = new Set(noteChunks.keys());
    fullDocIds = new Set(docChunks.keys());
  } else {
    ({ noteIds: fullNoteIds, docIds: fullDocIds } = pickFullBodies(
      snapshot.notes,
      snapshot.docs,
      opts.query,
      opts.fullBodies ?? DEFAULT_FULL_BODIES,
    ));
  }

  const sections: string[] = [];
  let used = 0;
  const push = (section: string) => {
    if (!section.trim()) return;
    if (used + section.length > budget) return;
    sections.push(section);
    used += section.length;
  };

  const p = snapshot.project;
  if (p) {
    push(
      [
        `# Workspace: ${p.name}`,
        p.description ? p.description : "",
        `Counts: ${snapshot.notes.length} notes · ${snapshot.specs.length} specs · ${snapshot.tasks.length} tasks · ${snapshot.sprints.length} sprints · ${snapshot.docs.length} docs · ${snapshot.standards.length} standards · ${snapshot.systems.length} systems · ${snapshot.memories.length} memories · ${snapshot.commits.length} commits`,
      ]
        .filter(Boolean)
        .join("\n") + "\n",
    );
  }

  // Memories first — they are distilled, high-signal facts.
  if (snapshot.memories.length) {
    const lines = [...snapshot.memories]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 40)
      .map((m) => `- [${m.type}] ${clip(m.content, 300)}`);
    push(`\n## Memories (long-term facts & decisions)\n${lines.join("\n")}\n`);
  }

  if (snapshot.specs.length) {
    const lines = snapshot.specs.map((s) => {
      const parts = [
        `- ${s.number} "${s.title}" — status: ${s.status}, progress: ${s.implementationProgress}%`,
      ];
      if (s.purpose) parts.push(`  Purpose: ${clip(s.purpose, 240)}`);
      if (s.goals.length)
        parts.push(`  Goals: ${clip(s.goals.join("; "), 300)}`);
      if (s.constraints.length)
        parts.push(`  Constraints: ${clip(s.constraints.join("; "), 240)}`);
      if (s.acceptance.length)
        parts.push(`  Acceptance: ${clip(s.acceptance.join("; "), 240)}`);
      return parts.join("\n");
    });
    push(`\n## Specifications\n${lines.join("\n")}\n`);
  }

  if (snapshot.tasks.length) {
    const byStatus = (status: Task["status"]) =>
      snapshot.tasks.filter((t) => t.status === status);
    const fmt = (t: Task) => {
      const spec = snapshot.specs.find((s) => s.id === t.specId);
      return `- [${t.status}] "${t.title}" (priority: ${t.priority}, assignee: ${t.assignee}${spec ? `, spec: ${spec.number}` : ""}, progress: ${t.progress}%, id: ${t.id})${t.description ? ` — ${clip(t.description, 160)}` : ""}`;
    };
    const active = [
      ...byStatus("in_progress"),
      ...byStatus("review"),
      ...byStatus("todo"),
    ].map(fmt);
    const backlog = byStatus("backlog").map(fmt);
    const done = byStatus("done").slice(-15).map(fmt);
    push(
      `\n## Tasks\n### Active\n${active.join("\n") || "(none)"}\n### Backlog\n${backlog.join("\n") || "(none)"}\n### Recently done\n${done.join("\n") || "(none)"}\n`,
    );
  }

  if (snapshot.sprints.length) {
    const lines = snapshot.sprints.map((s) => {
      const range =
        s.startDate && s.endDate
          ? ` (${day(s.startDate)} → ${day(s.endDate)})`
          : "";
      return `- "${s.name}" — ${s.status}${range}${s.goal ? ` — goal: ${clip(s.goal, 160)}` : ""}`;
    });
    push(`\n## Sprints\n${lines.join("\n")}\n`);
  }

  if (snapshot.systems.length) {
    const nameOf = (id: string) =>
      snapshot.systems.find((s) => s.id === id)?.name ?? id;
    const lines = snapshot.systems.map(
      (s) =>
        `- "${s.name}" (${s.category}, ${s.status}, health ${s.health})${s.dependencies.length ? ` → depends on: ${s.dependencies.map(nameOf).join(", ")}` : ""}${s.description ? ` — ${clip(s.description, 200)}` : ""}`,
    );
    push(`\n## Architecture systems\n${lines.join("\n")}\n`);
  }

  if (snapshot.standards.length) {
    const lines = snapshot.standards.map(
      (s) =>
        `- [${s.category}]${s.enforced ? " (enforced)" : ""} ${s.title}: ${clip(s.rule, 240)}`,
    );
    push(`\n## Coding standards\n${lines.join("\n")}\n`);
  }

  if (snapshot.notes.length) {
    const full: string[] = [];
    const brief: string[] = [];
    for (const n of [...snapshot.notes].sort(
      (a, b) => b.updatedAt - a.updatedAt,
    )) {
      const head = `"${n.title}" (${n.type}${n.tags.length ? `, tags: ${n.tags.join(", ")}` : ""}, id: ${n.id})`;
      if (fullNoteIds.has(n.id)) {
        const body =
          noteChunks?.get(n.id)?.join("\n…\n") ?? clip(n.body, BODY_CLIP);
        full.push(`### Note: ${head}\n${body}`);
      } else {
        brief.push(`- ${head}${n.excerpt ? ` — ${clip(n.excerpt, 180)}` : ""}`);
      }
    }
    push(
      `\n## Brain notes\n${full.join("\n\n")}\n\n### All other notes (titles + excerpts)\n${brief.join("\n") || "(none)"}\n`,
    );
  }

  if (snapshot.docs.length) {
    const full: string[] = [];
    const brief: string[] = [];
    for (const d of [...snapshot.docs].sort(
      (a, b) => b.updatedAt - a.updatedAt,
    )) {
      const head = `"${d.title}" (category: ${d.category}, id: ${d.id})`;
      if (fullDocIds.has(d.id)) {
        const body =
          docChunks?.get(d.id)?.join("\n…\n") ?? clip(d.body, BODY_CLIP);
        full.push(`### Doc: ${head}\n${body}`);
      } else {
        brief.push(`- ${head} — ${clip(stripMarkdown(d.body), 180)}`);
      }
    }
    push(
      `\n## Documentation\n${full.join("\n\n")}\n\n### All other docs\n${brief.join("\n") || "(none)"}\n`,
    );
  }

  if (snapshot.commits.length) {
    const lines = [...snapshot.commits]
      .sort((a, b) => b.date - a.date)
      .slice(0, 15)
      .map(
        (c) =>
          `- ${c.sha.slice(0, 7)} ${day(c.date)} ${c.author}: ${clip(c.message.split("\n")[0], 160)}${c.aiSummary ? ` — ${clip(c.aiSummary, 160)}` : ""}`,
      );
    push(`\n## Recent commits\n${lines.join("\n")}\n`);
  }

  if (snapshot.devLogs.length) {
    const lines = [...snapshot.devLogs]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 20)
      .map(
        (l) =>
          `- ${day(l.createdAt)} [${l.type}] ${l.title}${l.body ? ` — ${clip(stripMarkdown(l.body), 140)}` : ""}`,
      );
    push(`\n## Recent dev log\n${lines.join("\n")}\n`);
  }

  return sections.join("");
}

/**
 * Retrieves query-relevant note/doc chunks from the optional local AI
 * service. Returns `undefined` (never throws) when the service isn't
 * running, times out, or returns nothing — callers fall back to the
 * Fuse-based `pickFullBodies` path in that case.
 */
async function fetchRagChunks(
  projectId: string,
  query: string,
  topK: number,
  signal?: AbortSignal,
): Promise<RagChunk[] | undefined> {
  if (typeof window === "undefined") return undefined;
  try {
    // The caller's cancellation wins over the 4s backstop when both exist.
    const abort = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(4000)])
      : AbortSignal.timeout(4000);
    const res = await fetch("/api/python/rag", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId,
        query,
        topK,
        budgetChars: RAG_BUDGET_CHARS,
      }),
      signal: abort,
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { ok?: boolean; chunks?: RagChunk[] };
    if (!data.ok || !data.chunks?.length) return undefined;
    return data.chunks;
  } catch {
    return undefined;
  }
}

/** Fetch + format in one call. */
export async function assembleWorkspaceContext(
  projectId: string,
  opts: ContextOptions = {},
): Promise<string> {
  const snapshot = await fetchWorkspaceSnapshot(projectId);
  const query = opts.query?.trim();
  const ragChunks = query
    ? await fetchRagChunks(
        projectId,
        query,
        opts.fullBodies ?? DEFAULT_FULL_BODIES,
        opts.signal,
      )
    : undefined;
  return formatWorkspaceContext(snapshot, { ...opts, ragChunks });
}

/**
 * The system prompt for the workspace-aware assistant. Grounds the model in
 * the briefing and (when tools are enabled) tells it how to act on the
 * workspace rather than merely advise.
 *
 * `toolbelt` decides which tools actually exist for the model:
 *   - "workspace" — MasarFlow's browser workspace tools (notes, tasks, specs,
 *     docs, …) executed against the local database. Used by the in-browser
 *     Agent Loop (AI Agents, Workflow, chat over API/Ollama backends).
 *   - "filesystem" — opencode-style fs/shell/web tools executed by the
 *     OpenCode server against the session's working directory. Used by
 *     OpenCode-backed chat. The workspace briefing is real but read-only:
 *     there are NO workspace-DB tools in this session, so the prompt never
 *     offers tools the model cannot actually call.
 *   - undefined + withTools=false — chat mode: answer from the briefing only.
 */
export function buildAssistantSystemPrompt(
  contextText: string,
  opts: {
    withTools?: boolean;
    role?: string;
    toolbelt?: "workspace" | "filesystem";
    /** External projects linked to this workspace project (fs/shell tools). */
    linkedRoots?: { name: string; rootPath: string }[];
    /**
     * Free-form note appended to the filesystem toolbelt telling the model
     * where its tools are rooted (e.g. the session's working directory).
     */
    filesystemNote?: string;
    /**
     * The tools actually registered on the OpenCode server (id + description).
     * When provided the filesystem toolbelt lists these real tools instead of
     * the generic fs_* names — the model can then call tools that exist.
     */
    filesystemTools?: { id: string; description: string }[];
  } = {},
): string {
  const identity =
    opts.role ??
    "You are the MasarFlow workspace assistant — the intelligence layer of this software project. You have the user's entire local workspace in front of you: brain notes, specifications, tasks, sprints, architecture systems, coding standards, documentation, memories, dev logs, and commits.";

  const workspaceToolGuidance = `
You can ACT on the workspace through tools, not just advise. Your tool belt covers the whole project page-to-page:
- Brain: create/update/read notes, list/read note templates, create/read/update canvases, and manage folders.
- Planning: create/update/read specs, and create/read/update coding standards.
- Work: create/update/list tasks, and create/read/update/list sprints.
- Structure: create/read/update/list architecture systems, and manage knowledge-graph links (create/list/remove).
- Capture: create/update/read docs, dev-log entries, and long-term memories; annotate commits with AI summaries.
- Read-only insight into config/pipeline: files & attachments, agents, agent runs, workflow state, plugins, sync index, and watcher events.
Always:
- When the user asks you to create, update, or look up something, CALL the matching tool right away — do not merely describe what you would do. Emit the tool call, then act on its result.
- Tools remain available in every round of the conversation with the machine: you may think first, call tools while drafting, or call them after writing text — whenever you need more information, use them. After a tool returns, examine its result and continue working until the task is done; never stop after a single tool call unless the task is complete.
- Use the search or list/read tools before claiming something does not exist.
- After mutating the workspace, briefly tell the user what you changed.
- Reference entities precisely (spec numbers like RFC-001, task titles, note titles, system names).
- Never invent workspace content: if it is not in the briefing or a tool result, say so.`;

  const filesystemToolGuidance = opts.filesystemTools?.length
    ? `
You can ACT on the machine through filesystem/shell tools, not just advise. The tools you actually have in this session are:
${opts.filesystemTools
  .map((t) => {
    if (t.id === "question") {
      return "- question — ask the user something by opening a question dialog in the chat UI. Use it when you need a decision, preference, or clarification before continuing; the user answers in the dialog and the turn resumes with their reply.";
    }
    const approval =
      t.id === "bash" ||
      t.id === "edit" ||
      t.id === "write" ||
      t.id === "apply_patch" ||
      t.id === "webfetch" ||
      t.id === "shell"
        ? " REQUIRES user approval — the user sees and reviews each command/file before it executes; propose edits and commands confidently but expect review."
        : " Runs freely — no approval needed.";
    const desc = t.description.slice(0, 220);
    return `- ${t.id} — ${desc}${approval}`;
  })
  .join("\n")}
${opts.filesystemNote ? `Working directory note: ${opts.filesystemNote}\n` : ""}The workspace briefing below is real data from the user's MasarFlow project, but you have NO tools to mutate it in this session — it is read-only context only. Your tools work on the real files on disk.
Rules of engagement:
- Orient yourself with a read/list tool before reading or writing; read a file before overwriting it.
- Prefer search tools over guessing paths; prefer small, reviewable edits over full-file rewrites when possible.
- Use the shell tool for builds/tests/package commands; report failures honestly and propose fixes.
- When you change code, suggest (or ask the user to add) matching notes/specs/docs updates in the workspace — you cannot write those yourself in this session.
- Never invent files or content: if something is not on disk, say so.`
    : `
You can ACT on the machine through filesystem/shell tools, not just advise. The tools you actually have in this session are:
- fs_list — list a directory tree (read-only, runs freely).
- fs_read — read a text file (read-only, runs freely).
- fs_search — search files for names or content (read-only, runs freely).
- fs_write — create or overwrite a file (REQUIRES user approval — the user reviews the path and content first; propose edits confidently but expect review).
- shell_run — run a shell command, e.g. builds, tests, git, package managers, engine CLIs (REQUIRES user approval per command).
- webfetch — fetch a URL and return its contents.
${opts.filesystemNote ? `Working directory note: ${opts.filesystemNote}\n` : ""}The workspace briefing below is real data from the user's MasarFlow project, but you have NO tools to mutate it in this session — it is read-only context only. Your tools work on the real files on disk.
Rules of engagement:
- Orient with fs_list before reading or writing; read a file before overwriting it.
- Prefer fs_search over guessing paths; prefer small, reviewable edits over full-file rewrites when possible.
- Use shell_run for builds/tests/package commands; report failures honestly and propose fixes.
- When you change code, suggest (or ask the user to add) matching notes/specs/docs updates in the workspace — you cannot write those yourself in this session.
- Never invent files or content: if something is not on disk, say so.`;

  const toolGuidance = !opts.withTools
    ? `
Answer strictly from the workspace briefing below. If something is not in it, say you don't see it in the workspace rather than inventing it.`
    : opts.toolbelt === "filesystem"
      ? filesystemToolGuidance
      : workspaceToolGuidance;

  const linked = opts.linkedRoots?.length
    ? `

LINKED EXTERNAL PROJECTS (real folders on the user's machine — you have opencode-style agency over them):
${opts.linkedRoots.map((r) => `- "${r.name}" at ${r.rootPath}`).join("\n")}
Filesystem/shell tools (agentic mode): fs_list, fs_read, fs_search are read-only and run freely; fs_write and shell_run REQUIRE user approval — the user sees each command/file before it executes, so propose them confidently but expect review. Rules of engagement:
- Orient with fs_list before reading/writing; read a file before overwriting it.
- Keep the workspace and the external project in sync: when you change code, update the matching notes/specs/docs via the workspace tools, and vice versa.
- Prefer fs_search over guessing paths; prefer small, reviewable fs_write diffs over full-file rewrites when possible.
- Use shell_run for builds/tests/package commands; report failures honestly and propose fixes.`
    : "";

  return `${identity}
${toolGuidance}${linked}

Respond in concise Markdown. Use [[Note Title]] wikilink syntax when referring to brain notes.

---
WORKSPACE BRIEFING (real data, assembled now from the local database):

${contextText}`;
}
