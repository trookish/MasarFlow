/**
 * Markdown helpers used across the Brain module: wikilink parsing and
 * excerpt generation. Pure functions — no DOM, no DB — so they are unit
 * tested in isolation.
 */

/** A parsed `[[Target]]` or `[[Target|Alias]]` reference. */
export interface Wikilink {
  /** The note title being linked to (left side of the pipe). */
  target: string;
  /** Optional display alias (right side of the pipe), if present. */
  alias: string | null;
}

// `[[` ... `]]`, capturing the inner text. Non-greedy so adjacent links split.
const WIKILINK_RE = /\[\[([^\]]+?)\]\]/g;

/**
 * Extract every wikilink from markdown text, preserving order of first
 * appearance and de-duplicating by target (case-insensitive).
 */
export function extractWikilinks(markdown: string): Wikilink[] {
  const seen = new Set<string>();
  const links: Wikilink[] = [];
  for (const match of markdown.matchAll(WIKILINK_RE)) {
    const inner = match[1].trim();
    if (!inner) continue;
    const pipe = inner.indexOf("|");
    const target = (pipe === -1 ? inner : inner.slice(0, pipe)).trim();
    const alias = pipe === -1 ? null : inner.slice(pipe + 1).trim() || null;
    if (!target) continue;
    const key = target.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ target, alias });
  }
  return links;
}

/** Just the de-duplicated target titles, convenient for link syncing. */
export function extractWikilinkTargets(markdown: string): string[] {
  return extractWikilinks(markdown).map((l) => l.target);
}

/**
 * Strip common markdown syntax to plain text, then collapse whitespace.
 * Good enough for excerpts and search indexing (not a full parser).
 */
export function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ") // fenced code blocks
    .replace(/`[^`]*`/g, " ") // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links -> text
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, t, a) => a || t) // wikilinks -> alias/target
    .replace(/^#{1,6}\s+/gm, "") // headings
    .replace(/^>\s?/gm, "") // blockquotes
    .replace(/^[-*+]\s+/gm, "") // list markers
    .replace(/[*_~]/g, "") // emphasis markers
    .replace(/\s+/g, " ")
    .trim();
}

/** Build a short single-line excerpt from markdown body. */
export function makeExcerpt(markdown: string, maxLength = 160): string {
  const text = stripMarkdown(markdown);
  if (text.length <= maxLength) return text;
  const clipped = text.slice(0, maxLength);
  const lastSpace = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, lastSpace > 40 ? lastSpace : maxLength).trimEnd()}…`;
}
