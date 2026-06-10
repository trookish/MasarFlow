import type { Note } from "@/lib/db/schema";

const WIKILINK = /\[\[([^\[\]\n]+?)\]\]/g;

export interface ParsedLink {
  raw: string;
  target: string;
  slug: string;
  start: number;
  end: number;
}

export function parseWikiLinks(text: string): ParsedLink[] {
  const out: ParsedLink[] = [];
  let m: RegExpExecArray | null;
  WIKILINK.lastIndex = 0;
  while ((m = WIKILINK.exec(text)) !== null) {
    const target = m[1].trim();
    out.push({
      raw: m[0],
      target,
      slug: slugify(target),
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  return out;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface BacklinkResult {
  sourceNote: Note;
  snippet: string;
  matchedTarget: string;
}

export function findBacklinks(targetTitle: string, allNotes: Note[]): BacklinkResult[] {
  const targetSlug = slugify(targetTitle);
  const results: BacklinkResult[] = [];
  for (const n of allNotes) {
    if (!n.body) continue;
    const links = parseWikiLinks(n.body);
    const match = links.find((l) => l.slug === targetSlug);
    if (!match) continue;
    const start = Math.max(0, match.start - 60);
    const end = Math.min(n.body.length, match.end + 60);
    let snippet = n.body.slice(start, end);
    if (start > 0) snippet = "…" + snippet;
    if (end < n.body.length) snippet = snippet + "…";
    results.push({ sourceNote: n, snippet, matchedTarget: match.target });
  }
  return results;
}

export function extractTagsFromText(text: string): string[] {
  const tags = new Set<string>();
  const re = /(?:^|\s)#([a-z0-9][a-z0-9_-]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    tags.add(m[1].toLowerCase());
  }
  return Array.from(tags);
}
