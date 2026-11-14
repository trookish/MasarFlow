"use client";

import { useEffect, useRef } from "react";
import { Inspector } from "@/components/entity/inspector";
import { useUIStore } from "@/lib/stores/ui";
import { useInspectorSelection } from "@/lib/inspector/selection";
import { useInspectorPlacement } from "@/lib/inspector/use-inspector-placement";
import { AI_SECTIONS as REVEAL_EXEMPT, floatsInspector } from "@/lib/ui/archetype";
import {
  INSPECTOR_MAX_WIDTH,
  INSPECTOR_MIN_WIDTH,
  clampInspectorWidth,
} from "@/lib/inspector/presentation";
import { cn } from "@/lib/utils/cn";

const KEY_STEP = 16;

/**
 * Reveals the Inspector as an overlay when the user selects something on the page they are on while
 * it is not docked, and puts it away again when they switch pages or clear that selection. Arriving
 * on a page that already carries a selection (an opened task) reveals it only on pages that float
 * the Inspector by design; elsewhere (AI keeps the opened item in its URL) it stays out of the way.
 * Choosing a session or an agent on the AI surface is navigation, not inspection: never revealed.
 */
export function useRevealOnSelection(): void {
  const { presentation, selected, input } = useInspectorPlacement();
  const setRevealed = useInspectorSelection((s) => s.setRevealed);
  const last = useRef<{ page: string; selected: string | null }>({ page: "", selected: null });
  useEffect(() => {
    const prev = last.current;
    if (REVEAL_EXEMPT.has(input.pageHref)) {
      last.current = { page: input.pageHref, selected };
      return;
    }
    last.current = { page: input.pageHref, selected };
    if (prev.page !== input.pageHref) {
      setRevealed(Boolean(selected) && floatsInspector(input.pageHref));
      return;
    }
    if (selected && selected !== prev.selected && presentation === "hidden") setRevealed(true);
    else if (!selected && prev.selected && presentation === "overlay") setRevealed(false);
  }, [selected, presentation, input.pageHref, setRevealed]);
}

/** The docked column, with a drag/keyboard resize handle on its left edge. */
export function InspectorDock() {
  const { presentation, input, toggle } = useInspectorPlacement();
  const width = useUIStore((s) => s.inspectorWidth);
  const setWidth = useUIStore((s) => s.setInspectorWidth);
  const pinned = useUIStore((s) => s.inspectorPinned);
  const setPinned = useUIStore((s) => s.setInspectorPinned);
  const setRevealed = useInspectorSelection((s) => s.setRevealed);
  if (presentation !== "docked") return null;

  const floatingPage = floatsInspector(input.pageHref);
  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => setWidth(startWidth + (startX - ev.clientX));
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };

  return (
    <div className="relative z-20 flex h-full shrink-0" style={{ width: clampInspectorWidth(width) }}>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize inspector"
        aria-valuemin={INSPECTOR_MIN_WIDTH}
        aria-valuemax={INSPECTOR_MAX_WIDTH}
        aria-valuenow={clampInspectorWidth(width)}
        tabIndex={0}
        onPointerDown={startDrag}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setWidth(width + KEY_STEP);
          else if (e.key === "ArrowRight") setWidth(width - KEY_STEP);
          else return;
          e.preventDefault();
        }}
        className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize touch-none transition-colors hover:bg-primary/30 focus-visible:bg-primary/40 focus-visible:outline-none"
      />
      <Inspector
        className="w-full"
        frame={{
          presentation: "docked",
          pinnable: floatingPage,
          pinned,
          onPinToggle: () => {
            setPinned(!pinned);
            // Unpinning on a floating page keeps the panel on screen, now as an overlay.
            if (pinned) setRevealed(true);
          },
          onClose: toggle,
        }}
      />
    </div>
  );
}

/** The floating panel, rendered inside the page area so it covers only the page. */
export function InspectorOverlay() {
  const { presentation, toggle, dismiss, input } = useInspectorPlacement();
  const width = useUIStore((s) => s.inspectorWidth);
  const pinned = useUIStore((s) => s.inspectorPinned);
  const setPinned = useUIStore((s) => s.setInspectorPinned);
  const setOpen = useUIStore((s) => s.setInspectorOpen);
  const shown = presentation === "overlay";

  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("[role=dialog], [role=menu], [role=listbox]")) return;
      dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown, dismiss]);

  if (!shown) return null;
  return (
    <div
      className={cn(
        "absolute inset-y-0 right-0 z-30 flex max-w-[calc(100%-3rem)] shadow-2xl shadow-black/30",
      )}
      style={{ width: clampInspectorWidth(width) }}
      data-testid="inspector-overlay"
    >
      <Inspector
        className="w-full bg-card"
        frame={{
          presentation: "overlay",
          pinnable: floatsInspector(input.pageHref) && input.contentWidth >= 1000,
          pinned,
          onPinToggle: () => {
            setPinned(true);
            setOpen(true);
            dismiss();
          },
          onClose: toggle,
        }}
      />
    </div>
  );
}
