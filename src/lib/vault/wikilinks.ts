import type { Wikilink } from "./types";

const WIKILINK_RE = /(!?)\[\[([^\[\]]+?)\]\]/g;

export function findWikilinks(body: string): Wikilink[] {
  const out: Wikilink[] = [];
  WIKILINK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WIKILINK_RE.exec(body)) !== null) {
    const isEmbed = m[1] === "!";
    const inner = m[2].trim();
    let target = inner;
    let alias: string | null = null;
    let heading: string | null = null;
    const pipeIdx = inner.indexOf("|");
    if (pipeIdx >= 0) {
      target = inner.slice(0, pipeIdx).trim();
      alias = inner.slice(pipeIdx + 1).trim();
    }
    const hashIdx = target.indexOf("#");
    if (hashIdx >= 0) {
      heading = target.slice(hashIdx + 1).trim();
      target = target.slice(0, hashIdx).trim();
    }
    out.push({ raw: m[0], target, alias, heading, isEmbed, start: m.index, end: m.index + m[0].length });
  }
  return out;
}

export function wikilinkToTarget(filename: string): string {
  return filename.replace(/\.md$/i, "");
}

export function buildWikilink(target: string, alias?: string | null): string {
  return "[[" + target + (alias ? "|" + alias : "") + "]]";
}
