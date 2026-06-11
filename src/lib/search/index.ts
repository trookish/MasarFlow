import MiniSearch from "minisearch";
import { getDb } from "../db/schema";

export type SearchHitKind = "note" | "spec" | "task" | "doc" | "devlog" | "standard" | "agent" | "commit" | "system";

export interface SearchHit {
  id: string;
  type: SearchHitKind;
  title: string;
  subtitle: string;
  excerpt: string;
  href: string;
  score: number;
  tags: string[];
}

interface IndexedDoc {
  id: string;
  type: SearchHitKind;
  title: string;
  subtitle: string;
  body: string;
  href: string;
  tags: string[];
}

let cachedIndex: MiniSearch<IndexedDoc> | null = null;
let cachedAt = 0;
const CACHE_MS = 5000;

export async function buildSearchIndex(): Promise<MiniSearch<IndexedDoc>> {
  if (cachedIndex && Date.now() - cachedAt < CACHE_MS) return cachedIndex;
  const db = getDb();
  const [notes, specs, tasks, docs, logs, standards, agents, commits, systems] = await Promise.all([
    db.notes.toArray(),
    db.specs.toArray(),
    db.tasks.toArray(),
    db.docs.toArray(),
    db.devLogs.toArray(),
    db.standards.toArray(),
    db.agents.toArray(),
    db.commits.toArray(),
    db.systems.toArray(),
  ]);

  const docs2: IndexedDoc[] = [
    ...notes.map((n) => ({ id: n.id, type: "note" as const, title: n.title, subtitle: n.type, body: `${n.excerpt}\n${n.body}`, href: `/brain/${n.id}`, tags: n.tags })),
    ...specs.map((s) => ({ id: s.id, type: "spec" as const, title: `${s.number} - ${s.title}`, subtitle: s.status, body: `${s.purpose}\n${s.goals.join("\n")}\n${s.acceptance.join("\n")}\n${s.technicalNotes}`, href: `/specs/${s.id}`, tags: [] })),
    ...tasks.map((t) => ({ id: t.id, type: "task" as const, title: t.title, subtitle: `${t.status} - ${t.priority}`, body: t.description, href: "/tasks", tags: t.tags })),
    ...docs.map((d) => ({ id: d.id, type: "doc" as const, title: d.title, subtitle: d.kind, body: d.body, href: `/docs/${d.id}`, tags: [] })),
    ...logs.map((l) => ({ id: l.id, type: "devlog" as const, title: l.title, subtitle: l.kind, body: l.body, href: "/dev-logs", tags: [] })),
    ...standards.map((s) => ({ id: s.id, type: "standard" as const, title: s.title, subtitle: s.category, body: `${s.rule}\n${s.examples.join("\n")}`, href: "/standards", tags: [] })),
    ...agents.map((a) => ({ id: a.id, type: "agent" as const, title: a.name, subtitle: a.role, body: `${a.description}\n${a.persona}\n${a.capabilities.join(", ")}`, href: "/agents", tags: a.capabilities })),
    ...commits.map((c) => ({ id: c.id, type: "commit" as const, title: c.message, subtitle: c.hash, body: `${c.aiSummary ?? ""}\n${c.files.join("\n")}`, href: "/dev-logs", tags: [] })),
    ...systems.map((s) => ({ id: s.id, type: "system" as const, title: s.name, subtitle: s.kind, body: `${s.description}\nDepends on: ${s.dependsOn.join(", ")}\nExposes: ${s.exposes.join(", ")}`, href: "/architecture", tags: [] })),
  ];

  const index = new MiniSearch<IndexedDoc>({
    fields: ["title", "subtitle", "body", "tags"],
    storeFields: ["id", "type", "title", "subtitle", "href", "tags"],
    searchOptions: {
      boost: { title: 3, tags: 2, subtitle: 1.5 },
      fuzzy: 0.2,
      prefix: true,
      combineWith: "AND",
    },
  });
  index.addAll(docs2);
  cachedIndex = index;
  cachedAt = Date.now();
  return index;
}

export function invalidateSearchIndex(): void {
  cachedIndex = null;
  cachedAt = 0;
}

export function makeExcerpt(text: string, q: string, len = 140): string {
  if (!text) return "";
  const ql = q.toLowerCase();
  const lower = text.toLowerCase();
  const idx = lower.indexOf(ql);
  if (idx === -1) return text.slice(0, len);
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + ql.length + 100);
  let snippet = text.slice(start, end);
  if (start > 0) snippet = "..." + snippet;
  if (end < text.length) snippet = snippet + "...";
  return snippet;
}
