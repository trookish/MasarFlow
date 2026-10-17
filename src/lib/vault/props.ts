import type { PropValue } from "@/lib/db/schema";
import { RESERVED_KEYS } from "./serialize";

/**
 * Frontmatter properties as UI rows. `aliases` is the one key that is reserved
 * in the FILE but a normal property in the entity, so it stays editable here —
 * that is how the user maintains the aliases `[[Alias]]` resolves through.
 * `priority` stays editable for the same reason: on notes/docs/specs it is an
 * ordinary user property (and must round-trip); the serializer re-derives the
 * task/spec-level file fields from the entity regardless.
 */
export const PROP_BLOCKLIST: ReadonlySet<string> = new Set(
  RESERVED_KEYS.filter((k) => k !== "aliases" && k !== "priority"),
);

export type PropKind = "text" | "number" | "boolean" | "list";

export interface PropRow {
  key: string;
  value: PropValue;
  kind: PropKind;
}

/** Keys whose natural value shape is a list even before the user types one. */
const LIST_KEYS: ReadonlySet<string> = new Set(["aliases"]);

export function propKind(v: PropValue): PropKind {
  if (Array.isArray(v)) return "list";
  if (typeof v === "number") return "number";
  if (typeof v === "boolean") return "boolean";
  return "text";
}

export function toPropRows(props: Record<string, PropValue> | undefined): PropRow[] {
  return Object.entries(props ?? {})
    .filter(([k]) => !PROP_BLOCKLIST.has(k))
    .map(([key, value]) => ({ key, value, kind: propKind(value) }));
}

export function fromPropRows(rows: PropRow[]): Record<string, PropValue> {
  const out: Record<string, PropValue> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (!key || PROP_BLOCKLIST.has(key)) continue;
    if (Array.isArray(row.value)) {
      if (row.value.length) out[key] = row.value;
      continue;
    }
    if (typeof row.value === "string") {
      if (row.value.trim() !== "") out[key] = row.value;
      continue;
    }
    out[key] = row.value;
  }
  return out;
}

export function parsePropInput(raw: string, kind: PropKind): PropValue {
  const text = raw.trim();
  if (kind === "number") {
    const n = Number(text);
    return text !== "" && Number.isFinite(n) ? n : text;
  }
  if (kind === "boolean") return text === "true";
  if (kind === "list") return text.split(",").map((p) => p.trim()).filter(Boolean);
  return text;
}

export const addPropRow = (rows: PropRow[], key = ""): PropRow[] => [
  ...rows,
  { key, value: "", kind: LIST_KEYS.has(key.trim().toLowerCase()) ? "list" : "text" },
];
export const removePropRow = (rows: PropRow[], index: number): PropRow[] => rows.filter((_, i) => i !== index);
export const renamePropRow = (rows: PropRow[], index: number, key: string): PropRow[] =>
  rows.map((r, i) => (i === index ? { ...r, key } : r));
export function setPropValue(rows: PropRow[], index: number, raw: string): PropRow[] {
  return rows.map((r, i) => {
    if (i !== index) return r;
    const value = parsePropInput(raw, r.kind);
    return { ...r, value, kind: propKind(value) };
  });
}
