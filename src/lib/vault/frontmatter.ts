/**
 * The ONE frontmatter codec for MasarFlow's markdown vault.
 *
 * A deliberately small YAML subset: scalars, quoted scalars, `[a, b]` inline
 * lists and block lists — exactly what Obsidian's Properties UI writes for
 * text / number / checkbox / list properties. Nothing else is supported on
 * purpose: every unsupported line is preserved verbatim as part of the body
 * (never rewritten into something we cannot round-trip).
 */

export type PropValue = string | number | boolean | string[];

export interface Frontmatter {
  fields: Record<string, PropValue>;
  body: string;
}

/** Keys whose scalar form is a list (Obsidian tag / alias syntax). */
export const LIST_KEYS = new Set(["tags", "aliases"]);

const FENCE = /^---\n([\s\S]*?)\n---\n?/;
const BLOCK_ITEM = /^\s*-\s+/;
/** One path-hostile or YAML-hostile character (non-global: safe for `.test`). */
const RISKY_ONE = /[:#?*&!|>'"%@`{}[\],]/;

function unquote(raw: string): string {
  const s = raw.trim();
  if (s.length >= 2 && ((s[0] === '"' && s.endsWith('"')) || (s[0] === "'" && s.endsWith("'")))) {
    const inner = s.slice(1, -1);
    return s[0] === '"' ? inner.replace(/\\"/g, '"').replace(/\\\\/g, "\\") : inner;
  }
  return s;
}

function scalar(raw: string): PropValue {
  const s = unquote(raw);
  if (s === "true" || s === "false") return s === "true";
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return s;
}

/** Split a frontmatter block + body. Tolerant: never throws on user files. */
export function parseFrontmatter(md: string): Frontmatter {
  const norm = md.replace(/\r\n/g, "\n");
  const m = norm.match(FENCE);
  if (!m) return { fields: {}, body: norm.replace(/^\n+/, "") };
  const fields: Record<string, PropValue> = {};
  let key: string | null = null;
  let items: string[] | null = null;
  const flush = (): void => {
    if (key && items) fields[key] = items;
    key = null;
    items = null;
  };
  for (const line of m[1].split("\n")) {
    if (BLOCK_ITEM.test(line) && key) {
      const raw = line.replace(BLOCK_ITEM, "");
      items = [...(items ?? []), String(scalar(raw))];
      continue;
    }
    const at = line.indexOf(":");
    if (at === -1) continue;
    flush();
    const k = line.slice(0, at).trim();
    const rest = line.slice(at + 1).trim();
    if (!k) continue;
    if (rest === "") {
      key = k;
      items = [];
      continue;
    }
    if (LIST_KEYS.has(k)) {
      const list = rest.startsWith("[") && rest.endsWith("]") ? rest.slice(1, -1) : rest;
      fields[k] = list
        .split(",")
        .map((p) => String(scalar(p)).trim())
        .filter((p) => p !== "");
      continue;
    }
    if (rest.startsWith("[") && rest.endsWith("]")) {
      const inner = rest.slice(1, -1).trim();
      fields[k] = inner === "" ? [] : inner.split(",").map((p) => String(scalar(p)).trim());
      continue;
    }
    fields[k] = scalar(rest);
  }
  flush();
  return { fields, body: norm.slice(m[0].length).replace(/^\n+/, "") };
}

const RISKY = new RegExp(`(?:${RISKY_ONE.source})|^\\s|\\s$|^-`);
/** ISO-8601 date/timestamps stay unquoted — YAML reads them as dates, which is what we mean. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

/** One value as YAML text. Quoted whenever YAML would misread it. */
export function yamlScalar(v: PropValue): string {
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  const s = Array.isArray(v) ? v.join(", ") : v;
  if (s === "") return '""';
  if (
    s === "true" ||
    s === "false" ||
    /^-?\d+(\.\d+)?$/.test(s) ||
    (!ISO_DATE.test(s) && (RISKY.test(s) || s.startsWith("-")))
  ) {
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return s;
}

/** Render a frontmatter block + body. Empty lists and undefined keys vanish. */
export function stringifyFrontmatter(
  fields: Record<string, PropValue | undefined>,
  body: string,
): string {
  const lines: string[] = ["---"];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      if (v.length === 0) continue;
      lines.push(`${k}:`);
      for (const item of v) lines.push(`  - ${yamlScalar(item)}`);
      continue;
    }
    lines.push(`${k}: ${yamlScalar(v)}`);
  }
  lines.push("---");
  const clean = body.replace(/\r\n/g, "\n").replace(/^\n+/, "").replace(/\n+$/, "");
  return `${lines.join("\n")}\n\n${clean}\n`;
}

/** Read a value as text (lists join with ", "). */
export function asString(v: unknown, fallback = ""): string {
  if (v === undefined || v === null) return fallback;
  if (Array.isArray(v)) return v.map(String).join(", ");
  return String(v);
}

/** Read a value as a list ("a, b" and ["a","b"] both work). */
export function asList(v: unknown): string[] {
  if (v === undefined || v === null) return [];
  if (Array.isArray(v)) return v.map(String);
  return String(v)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
