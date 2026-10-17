import type { Link } from "@/lib/db/schema";
import { isEntityKind, type EntityRef } from "./registry";

export interface LinkEdge {
  linkId: string;
  other: EntityRef;
  linkType: Link["linkType"];
  label: string;
}

/** Split project links into those pointing AT `ref` and those leaving it. */
export function computeBacklinks(
  links: Link[],
  ref: EntityRef,
): { incoming: LinkEdge[]; outgoing: LinkEdge[] } {
  const incoming: LinkEdge[] = [];
  const outgoing: LinkEdge[] = [];
  for (const l of links) {
    if (l.targetType === ref.kind && l.targetId === ref.id && isEntityKind(l.sourceType)) {
      incoming.push({ linkId: l.id, other: { kind: l.sourceType, id: l.sourceId }, linkType: l.linkType, label: l.label });
    }
    if (l.sourceType === ref.kind && l.sourceId === ref.id && isEntityKind(l.targetType)) {
      outgoing.push({ linkId: l.id, other: { kind: l.targetType, id: l.targetId }, linkType: l.linkType, label: l.label });
    }
  }
  return { incoming, outgoing };
}
