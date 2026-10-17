"use client";

/**
 * Drag overlay: dims the workspace and draws the active drop-zone preview —
 * a translucent accent panel (edge zones) or a tab strip glow (tab zone) —
 * plus a floating chip naming the action. Pure presentation: all geometry
 * comes from the workspace's measured rects.
 */

import { useMemo } from "react";
import type { DockZone } from "@/lib/dock/types";
import { splitPreviewRect, type Rect } from "@/lib/dock/geometry";
import { useDockStore } from "@/lib/stores/dock";
import { getPageDef } from "@/lib/dock/registry";
import { pageIdOf } from "@/lib/dock/types";

const ZONE_LABEL: Record<DockZone, string> = {
  left: "Dock left",
  right: "Dock right",
  top: "Dock top",
  bottom: "Dock bottom",
  tab: "Move to group",
};

export function DockOverlay({ workspaceRect }: { workspaceRect: Rect }) {
  const drag = useDockStore((s) => s.drag);
  const zone = drag?.zone ?? null;
  const targetId = drag?.targetId ?? null;

  const preview = useMemo(() => {
    if (!zone || !targetId) return null;
    const el = document.querySelector(`[data-dock-node="${targetId}"]`);
    if (!el) return null;
    const box = el.getBoundingClientRect();
    const rect: Rect = { x: box.left, y: box.top, width: box.width, height: box.height };
    if (zone === "tab") return rect; // full-target highlight for tab-merges
    return splitPreviewRect(rect, zone, 0.5);
  }, [zone, targetId]);

  const label = useMemo(() => {
    if (!drag) return null;
    if (drag.source.kind === "floater") return "Dock window";
    const panelId =
      drag.source.kind === "panel"
        ? drag.source.panelId
        : drag.source.nodeId;
    const def = getPageDef(panelId);
    return def?.label ?? pageIdOf(panelId);
  }, [drag]);

  if (!drag) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {preview ? (
        <div
          className="absolute border-2 border-primary/70 bg-primary/20 transition-all duration-100"
          style={{
            left: preview.x - workspaceRect.x,
            top: preview.y - workspaceRect.y,
            width: preview.width,
            height: preview.height,
            borderRadius: zone === "tab" ? 6 : 8,
          }}
        />
      ) : null}
      {drag.refused ? (
        <div
          className="absolute flex items-center gap-1.5 rounded-md border border-destructive/50 bg-popover px-2 py-1 text-xs font-medium text-destructive shadow-lg"
          style={{
            left: drag.pointer.x - workspaceRect.x + 12,
            top: drag.pointer.y - workspaceRect.y + 12,
          }}
        >
          {drag.refused}
        </div>
      ) : null}
      {zone ? (
        <div
          className="absolute flex items-center gap-1 rounded-md border border-border bg-popover px-2 py-1 text-xs font-medium shadow-lg"
          style={{
            left: drag.pointer.x - workspaceRect.x + 12,
            top: drag.pointer.y - workspaceRect.y + 12,
          }}
        >
          {label ? <span className="text-muted-foreground">{label} →</span> : null}
          {ZONE_LABEL[zone]}
        </div>
      ) : null}
    </div>
  );
}
