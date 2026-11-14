"use client";

import { useEffect } from "react";
import { useInspectorSelection, type InspectorSelection } from "./selection";

/**
 * Publish what a page has selected to the Inspector, under the page's section href
 * ("/knowledge", "/architecture", ...). Cleared when the page unmounts or the selection ends.
 */
export function usePublishSelection(sectionHref: string, selection: InspectorSelection | null): void {
  const select = useInspectorSelection((s) => s.select);
  const refKey = selection?.ref ? `${selection.ref.kind}:${selection.ref.id}` : null;
  const cardKey = selection?.card?.key ?? null;
  const cardSig = selection?.card ? JSON.stringify(selection.card) : null;
  useEffect(() => {
    if (!refKey && !cardSig) {
      select(sectionHref, null);
      return;
    }
    select(sectionHref, selection);
    // `selection` is rebuilt every render; its identity is carried by refKey / cardSig.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionHref, refKey, cardKey, cardSig, select]);
  useEffect(() => () => select(sectionHref, null), [sectionHref, select]);
}
