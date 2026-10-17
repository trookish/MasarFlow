import {
  NOTE_TYPES,
  type Doc,
  type Note,
  type NoteType,
  type Spec,
  type Task,
} from "@/lib/db/schema";
import { asList, asString, parseFrontmatter, stringifyFrontmatter, type PropValue } from "./frontmatter";
import { MIRROR_KINDS, type MirrorKind } from "./paths";

/**
 * The vault file format. Frontmatter keys are flat (`msf_id`, not a nested
 * object) because Obsidian's Properties UI only understands flat YAML.
 * Known keys are always re-derived from the entity; everything else travels in
 * `props` so a property the user typed in Obsidian is never lost.
 */

export const RESERVED_KEYS: readonly string[] = [
  "title", "type", "tags", "aliases", "created", "updated",
  "status", "priority", "number", "category", "progress", "day",
  "msf_id", "msf_kind", "msf_project",
];
const RESERVED = new Set(RESERVED_KEYS);

export interface ParsedVaultDoc {
  fields: Record<string, PropValue>;
  kind: MirrorKind | null;
  id: string | null;
  title: string;
  tags: string[];
  aliases: string[];
  day: string | null;
  props: Record<string, PropValue>;
  body: string;
}

export function propsFromFields(fields: Record<string, PropValue>): Record<string, PropValue> {
  const out: Record<string, PropValue> = {};
  for (const [k, v] of Object.entries(fields)) if (!RESERVED.has(k)) out[k] = v;
  return out;
}

const iso = (ts: number): string => new Date(ts).toISOString();

function compact<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

function unknownProps(props: Record<string, PropValue> | undefined): Record<string, PropValue> {
  return propsFromFields(props ?? {});
}

const isNoteType = (v: string): v is NoteType => (NOTE_TYPES as readonly string[]).includes(v);

/** Frontmatter-only fields per kind (body comes from `bodyOf`). */
function kindFields(kind: MirrorKind, row: Note | Doc | Spec | Task): Record<string, PropValue | undefined> {
  switch (kind) {
    case "note":
      return { type: (row as Note).type };
    case "doc":
      return { category: (row as Doc).category };
    case "spec": {
      const s = row as Spec;
      return { number: s.number, status: s.status, progress: s.implementationProgress };
    }
    case "task": {
      const t = row as Task;
      return { status: t.status, priority: t.priority };
    }
  }
}

/** Serialize one entity to a complete vault document. */
export function serializeEntity(
  kind: MirrorKind,
  row: Note | Doc | Spec | Task,
  meta: { projectSlug: string },
): string {
  const aliases = Array.isArray(row.props?.aliases) ? (row.props.aliases as string[]) : undefined;
  const fields: Record<string, PropValue | undefined> = {
    title: row.title || "untitled",
    ...kindFields(kind, row),
    ...(kind === "spec" ? {} : { tags: (row as Note | Task).tags }),
    aliases: aliases && aliases.length ? aliases : undefined,
    created: iso(row.createdAt),
    updated: iso(row.updatedAt),
    msf_id: row.id,
    msf_kind: kind,
    msf_project: meta.projectSlug,
    ...unknownProps(row.props),
  };
  return stringifyFrontmatter(fields, bodyOf(kind, row));
}

/** Markdown body of an entity (specs get real sections). */
export function bodyOf(kind: MirrorKind, row: Note | Doc | Spec | Task): string {
  switch (kind) {
    case "note":
      return (row as Note).body;
    case "doc":
      return (row as Doc).body;
    case "task":
      return (row as Task).description;
    case "spec":
      throw new Error("spec body is wired in P7.T4");
  }
}

export function parseVaultDoc(content: string): ParsedVaultDoc {
  const { fields, body } = parseFrontmatter(content);
  const rawKind = asString(fields.msf_kind);
  const kind = (MIRROR_KINDS as readonly string[]).includes(rawKind) ? (rawKind as MirrorKind) : null;
  return {
    fields,
    kind,
    id: asString(fields.msf_id) || null,
    title: asString(fields.title),
    tags: asList(fields.tags),
    aliases: asList(fields.aliases),
    day: asString(fields.day) || null,
    props: propsFromFields(fields),
    body,
  };
}

export type VaultPatch =
  | { kind: "note"; patch: Partial<Omit<Note, "id" | "projectId" | "createdAt">> }
  | { kind: "doc"; patch: Partial<Doc> }
  | { kind: "spec"; patch: Partial<Spec> }
  | { kind: "task"; patch: Partial<Task> };

/** The entity fields' patch a file describes. Timestamps stay the repo's job. */
export function applyVaultDoc(kind: MirrorKind, doc: ParsedVaultDoc): VaultPatch {
  const props: Record<string, PropValue> = { ...doc.props };
  if (doc.aliases.length) props.aliases = doc.aliases;
  switch (kind) {
    case "note": {
      const type = asString(doc.fields.type);
      return {
        kind: "note",
        patch: compact({
          title: doc.title || "untitled",
          body: doc.body,
          type: isNoteType(type) ? type : undefined,
          tags: doc.tags,
          props,
        }),
      };
    }
    case "doc":
      return {
        kind: "doc",
        patch: compact({
          title: doc.title || "untitled",
          body: doc.body,
          category: asString(doc.fields.category) || undefined,
          props,
        }),
      };
    case "spec":
    case "task":
      throw new Error(`vault kind ${kind} is wired in P7.T4`);
  }
}
