import type { GraphNode } from "./types";

/** A colour group: nodes matching `query` are drawn in `color` (a `--node-*` token). */
export interface GraphGroup {
  id: string;
  query: string;
  color: string;
}

/** Theme tokens a group can use. Tokens, not hex, so groups follow the active theme. */
export const GROUP_COLORS: ReadonlyArray<{ token: string; label: string }> = [
  { token: "--node-idea", label: "Amber" },
  { token: "--node-system", label: "Blue" },
  { token: "--node-mechanic", label: "Cyan" },
  { token: "--node-research", label: "Violet" },
  { token: "--node-experiment", label: "Pink" },
  { token: "--node-lore", label: "Green" },
  { token: "--node-decision", label: "Red" },
  { token: "--node-commit", label: "Orange" },
];

/**
 * Does a node match a group query? Supported terms: `tag:name`, `type:kind` (note type or entity
 * kind) and `kind:category`; anything else is matched against the label. Terms are ANDed.
 */
export function matchesGroup(node: GraphNode, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return false;
  return terms.every((term) => {
    const colon = term.indexOf(":");
    if (colon > 0) {
      const field = term.slice(0, colon);
      const value = term.slice(colon + 1);
      if (field === "tag") return node.tags.some((t) => t.toLowerCase() === value);
      if (field === "type") return node.kind === value;
      if (field === "kind") return node.category === value;
    }
    return node.label.toLowerCase().includes(term);
  });
}

/** The colour token of the first group the node matches, or null for the default kind colour. */
export function groupColorFor(node: GraphNode, groups: readonly GraphGroup[]): string | null {
  for (const g of groups) if (matchesGroup(node, g.query)) return g.color;
  return null;
}
