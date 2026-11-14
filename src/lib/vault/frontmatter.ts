import matter from "gray-matter";
import type { ParsedFrontmatter } from "./types";
import type { NoteType, TaskStatus, TaskPriority } from "../db/schema";
import { NOTE_TYPES, TASK_STATUS, TASK_PRIORITY } from "../db/schema";

const KNOWN_KEYS = new Set([
  "type",
  "tags",
  "aliases",
  "status",
  "priority",
  "scheduled",
  "completedDate",
  "dateCreated",
  "dateModified",
  "sticker",
  "tasknotes_manual_order",
  "title",
]);

function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === "string")
    return v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  return [];
}

function parseDate(v: unknown): number | null {
  if (v == null) return null;
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d.getTime();
  }
  return null;
}

function pickNoteType(v: unknown): NoteType | null {
  if (typeof v !== "string") return null;
  const lower = v.toLowerCase() as NoteType;
  return (NOTE_TYPES as readonly string[]).includes(lower) ? lower : null;
}

function pickTaskStatus(v: unknown): TaskStatus | null {
  if (typeof v !== "string") return null;
  const lower = v.toLowerCase().replace(/\s+/g, "_") as TaskStatus;
  return (TASK_STATUS as readonly string[]).includes(lower) ? lower : null;
}

function pickTaskPriority(v: unknown): TaskPriority | null {
  if (typeof v !== "string") return null;
  const lower = v.toLowerCase() as TaskPriority;
  return (TASK_PRIORITY as readonly string[]).includes(lower) ? lower : null;
}

export function parseFrontmatter(body: string): ParsedFrontmatter {
  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(body);
  } catch {
    return {
      type: null,
      tags: [],
      aliases: [],
      status: null,
      priority: null,
      scheduled: null,
      completedDate: null,
      dateCreated: null,
      dateModified: null,
      raw: {},
    };
  }
  const data = parsed.data as Record<string, unknown>;
  const raw: Record<string, unknown> = {};
  for (const k of Object.keys(data)) {
    if (!KNOWN_KEYS.has(k)) raw[k] = data[k];
  }
  return {
    type: pickNoteType(data.type),
    tags: toStringArray(data.tags),
    aliases: toStringArray(data.aliases),
    status: pickTaskStatus(data.status),
    priority: pickTaskPriority(data.priority),
    scheduled: parseDate(data.scheduled),
    completedDate: parseDate(data.completedDate),
    dateCreated: parseDate(data.dateCreated),
    dateModified: parseDate(data.dateModified),
    raw,
  };
}

export function serializeFrontmatter(fm: ParsedFrontmatter): string {
  const data: Record<string, unknown> = { ...fm.raw };
  if (fm.type) data.type = fm.type;
  if (fm.tags.length) data.tags = fm.tags;
  if (fm.aliases.length) data.aliases = fm.aliases;
  if (fm.status) data.status = fm.status;
  if (fm.priority) data.priority = fm.priority;
  if (fm.scheduled) data.scheduled = new Date(fm.scheduled).toISOString();
  if (fm.completedDate) data.completedDate = new Date(fm.completedDate).toISOString();
  if (fm.dateCreated) data.dateCreated = new Date(fm.dateCreated).toISOString();
  if (fm.dateModified) data.dateModified = new Date(fm.dateModified).toISOString();
  return matter.stringify("", data);
}

export function hasFrontmatter(body: string): boolean {
  return /^---\s*[\r\n]/.test(body);
}

export function stripFrontmatter(body: string): string {
  return body.replace(/^---\s*[\r\n][\s\S]*?[\r\n]---\s*[\r\n]?/, "");
}

export function extractTitleFromBody(body: string, fallback: string): string {
  const m = body.match(/^#\s+(.+)$/m);
  if (m) return m[1].trim();
  return fallback;
}
