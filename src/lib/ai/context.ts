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

export interface ContextOptions {
  /** Free-text query used to pick which note/doc bodies are inlined in full. */
  query?: string;
  /** Approximate character budget for the whole briefing. */
  budget?: number;
  /** How many of the most relevant notes/docs get their full body inlined. */
  fullBodies?: number;
}

const DEFAULT_BUDGET = 28_000;
const DEFAULT_FULL_BODIES = 6;
const BODY_CLIP = 4_000;

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
  type Entry = { kind: "note" | "doc"; id: string; title: string; body: string; updatedAt: number };
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
  const { noteIds: fullNoteIds, docIds: fullDocIds } = pickFullBodies(
    snapshot.notes,
    snapshot.docs,
    opts.query,
    opts.fullBodies ?? DEFAULT_FULL_BODIES,
  );

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
      if (s.goals.length) parts.push(`  Goals: ${clip(s.goals.join("; "), 300)}`);
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
    const done = byStatus("done")
      .slice(-15)
      .map(fmt);
    push(
      `\n## Tasks\n### Active\n${active.join("\n") || "(none)"}\n### Backlog\n${backlog.join("\n") || "(none)"}\n### Recently done\n${done.join("\n") || "(none)"}\n`,
    );
  }

  if (snapshot.sprints.length) {
    const lines = snapshot.sprints.map((s) => {
      const range =
        s.startDate && s.endDate ? ` (${day(s.startDate)} → ${day(s.endDate)})` : "";
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
    for (const n of [...snapshot.notes].sort((a, b) => b.updatedAt - a.updatedAt)) {
      const head = `"${n.title}" (${n.type}${n.tags.length ? `, tags: ${n.tags.join(", ")}` : ""}, id: ${n.id})`;
      if (fullNoteIds.has(n.id)) {
        full.push(`### Note: ${head}\n${clip(n.body, BODY_CLIP)}`);
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
    for (const d of [...snapshot.docs].sort((a, b) => b.updatedAt - a.updatedAt)) {
      const head = `"${d.title}" (category: ${d.category}, id: ${d.id})`;
      if (fullDocIds.has(d.id)) {
        full.push(`### Doc: ${head}\n${clip(d.body, BODY_CLIP)}`);
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
      .map((l) => `- ${day(l.createdAt)} [${l.type}] ${l.title}${l.body ? ` — ${clip(stripMarkdown(l.body), 140)}` : ""}`);
    push(`\n## Recent dev log\n${lines.join("\n")}\n`);
  }

  return sections.join("");
}

/** Fetch + format in one call. */
export async function assembleWorkspaceContext(
  projectId: string,
  opts: ContextOptions = {},
): Promise<string> {
  const snapshot = await fetchWorkspaceSnapshot(projectId);
  return formatWorkspaceContext(snapshot, opts);
}

/**
 * The system prompt for the workspace-aware assistant. Grounds the model in
 * the briefing and (when tools are enabled) tells it how to act on the
 * workspace rather than merely advise.
 */
export function buildAssistantSystemPrompt(
  contextText: string,
  opts: { withTools?: boolean; role?: string } = {},
): string {
  const identity =
    opts.role ??
    "You are the MasarFlow workspace assistant — the intelligence layer of this software project. You have the user's entire local workspace in front of you: brain notes, specifications, tasks, sprints, architecture systems, coding standards, documentation, memories, dev logs, and commits.";
  const toolGuidance = opts.withTools
    ? `
You can ACT on the workspace through tools, not just advise:
- Use tools to create/update notes, specs, tasks, dev log entries, and memories when the user asks for changes or when recording your work is clearly useful.
- Prefer reading with the search/read tools before claiming something does not exist.
- After mutating the workspace, briefly tell the user what you changed.
- Reference entities precisely (spec numbers like RFC-001, task titles, note titles).
- Never invent workspace content: if it is not in the briefing or a tool result, say so.`
    : `
Answer strictly from the workspace briefing below. If something is not in it, say you don't see it in the workspace rather than inventing it.`;

  return `${identity}
${toolGuidance}

Respond in concise Markdown. Use [[Note Title]] wikilink syntax when referring to brain notes.

---
WORKSPACE BRIEFING (real data, assembled now from the local database):

${contextText}`;
}
