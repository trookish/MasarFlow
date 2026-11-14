"use client";

import { useUIStore } from "@/lib/stores/ui";
import { useInspectorView } from "@/components/entity/inspector";
import { selectionKey } from "@/lib/inspector/selection";
import { useInspectorSelection } from "@/lib/inspector/selection";
import {
  inspectorPresentation,
  toggleInspector,
  type InspectorPresentation,
  type PresentationInput,
} from "@/lib/inspector/presentation";

export interface InspectorPlacement {
  presentation: InspectorPresentation;
  /** Key of what is selected now (entity or published card), or null. */
  selected: string | null;
  input: PresentationInput;
  toggle: () => void;
  dismiss: () => void;
}

/** Where the Inspector is shown for the focused tab; shared by the shell, the topbar and the host. */
export function useInspectorPlacement(): InspectorPlacement {
  const open = useUIStore((s) => s.inspectorOpen);
  const pinned = useUIStore((s) => s.inspectorPinned);
  const setOpen = useUIStore((s) => s.setInspectorOpen);
  const revealed = useInspectorSelection((s) => s.revealed);
  const contentWidth = useInspectorSelection((s) => s.contentWidth);
  const setRevealed = useInspectorSelection((s) => s.setRevealed);
  const { view, card } = useInspectorView();

  const input: PresentationInput = {
    open,
    revealed,
    pinned,
    contentWidth,
    pageHref: view.selectionKey ?? "",
  };
  const selected = selectionKey({ ref: view.ref, card });

  return {
    presentation: inspectorPresentation(input),
    selected,
    input,
    toggle: () => {
      const next = toggleInspector(input);
      setOpen(next.open);
      setRevealed(next.revealed);
    },
    dismiss: () => setRevealed(false),
  };
}
