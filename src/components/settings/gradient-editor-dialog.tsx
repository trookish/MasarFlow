"use client";

import { useMemo, useRef, useState } from "react";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  useThemeStore,
  clampPosition,
  gradientCss,
  normalizeStops,
  type GradientStop,
} from "@/lib/stores/theme";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Unity-style gradient editor. A horizontal bar shows the live gradient with
 * draggable color stops: click an empty spot to add a stop, drag a marker to
 * move it, pick the selected stop's color, and remove stops freely (two is
 * the minimum). Edits stay in a local draft until Apply — Cancel discards.
 */
export function GradientEditorDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const angle = useThemeStore((s) => s.gradientAngle);
  const setGradientStops = useThemeStore((s) => s.setGradientStops);

  const [draft, setDraft] = useState<GradientStop[]>(() =>
    normalizeStops(useThemeStore.getState().gradientStops),
  );
  const [selected, setSelected] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);

  const preview = useMemo(() => gradientCss(draft, angle), [draft, angle]);

  /** Position (0–100) of a pointer event over the stop bar. */
  function positionFromClientX(clientX: number): number {
    const bar = barRef.current;
    if (!bar) return 0;
    const rect = bar.getBoundingClientRect();
    if (rect.width === 0) return 0;
    return clampPosition(((clientX - rect.left) / rect.width) * 100);
  }

  function updateStop(index: number, patch: Partial<GradientStop>) {
    setDraft((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    );
  }

  function addStop(position: number) {
    setDraft((prev) => {
      const stops = [...prev, { color: "#ffffff", position }];
      return normalizeStops(stops);
    });
  }

  function removeStop(index: number) {
    setDraft((prev) => {
      if (prev.length <= 2) return prev;
      const stops = prev.filter((_, i) => i !== index);
      setSelected((sel) => Math.min(sel, stops.length - 1));
      return stops;
    });
  }

  function apply() {
    setGradientStops(draft);
    onClose();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      ariaLabel="Custom gradient editor"
      className="w-[520px] p-0"
    >
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold">Custom gradient</h2>
          <p className="text-xs text-muted-foreground">
            Click the bar to add a stop · drag markers to move them · minimum
            two stops.
          </p>
        </div>
      </div>

      <div className="space-y-4 p-5">
        {/* Live preview */}
        <div
          className="h-12 w-full rounded-md border border-border shadow-inner"
          style={{ backgroundImage: preview }}
          role="img"
          aria-label="Gradient preview"
        />

        {/* Stop bar */}
        <div className="space-y-1">
          <div
            ref={barRef}
            onPointerDown={(e) => {
              // Clicking empty bar space adds a stop there (Unity behavior).
              const pos = positionFromClientX(e.clientX);
              const hit = draft.findIndex(
                (s) => Math.abs(s.position - pos) <= 2.5,
              );
              if (hit === -1) addStop(pos);
              else setSelected(hit);
            }}
            className="relative h-9 cursor-copy touch-none rounded-md border border-border bg-muted/40"
          >
            <div
              className="absolute inset-0 rounded-md"
              style={{ backgroundImage: preview }}
            />
            {draft.map((s, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Stop ${i + 1} at ${s.position}%`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setSelected(i);
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (e.buttons & 1)
                    updateStop(i, { position: positionFromClientX(e.clientX) });
                }}
                onKeyDown={(e) => {
                  const step = e.shiftKey ? 10 : 1;
                  if (e.key === "ArrowLeft") {
                    e.preventDefault();
                    updateStop(i, {
                      position: clampPosition(s.position - step),
                    });
                  } else if (e.key === "ArrowRight") {
                    e.preventDefault();
                    updateStop(i, {
                      position: clampPosition(s.position + step),
                    });
                  }
                }}
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-sm outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-ring"
                style={{ left: `${s.position}%` }}
                title={`${Math.round(s.position)}%`}
              >
                <span
                  className={cn(
                    "block h-6 w-4 rounded-sm border-2 shadow-md transition-transform",
                    i === selected
                      ? "scale-125 border-white"
                      : "border-black/50 hover:scale-110",
                  )}
                  style={{ backgroundColor: s.color }}
                />
                <span
                  className={cn(
                    "absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] font-medium tabular-nums",
                    i === selected
                      ? "text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {Math.round(s.position)}%
                </span>
              </button>
            ))}
          </div>

          {/* Stop list / details for the selected stop */}
          <div className="flex flex-wrap items-center gap-2">
            {draft.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setSelected(i)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors",
                  i === selected
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
                title={`Stop at ${Math.round(s.position)}%`}
              >
                <span
                  className="h-3 w-3 rounded-full border border-border"
                  style={{ backgroundColor: s.color }}
                />
                {Math.round(s.position)}%
              </button>
            ))}
            <button
              type="button"
              onClick={() => addStop(50)}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:border-primary/50 hover:text-foreground"
            >
              <Plus className="h-3 w-3" /> Add stop
            </button>
          </div>

          {/* Selected stop controls */}
          {draft[selected] && (
            <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
              <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Color
                <input
                  type="color"
                  value={draft[selected].color}
                  onChange={(e) =>
                    updateStop(selected, { color: e.target.value })
                  }
                  aria-label="Stop color"
                  className="h-7 w-9 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
                />
              </label>
              <Input
                value={draft[selected].color}
                onChange={(e) => {
                  const v = e.target.value;
                  updateStop(selected, { color: v });
                }}
                onBlur={() =>
                  updateStop(selected, {
                    color: /^#[0-9a-fA-F]{6}$/.test(draft[selected].color)
                      ? draft[selected].color
                      : "#dedede",
                  })
                }
                aria-label="Stop hex color"
                className="h-7 w-24 font-mono text-xs"
              />
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Position
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={Math.round(draft[selected].position)}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) {
                      updateStop(selected, { position: clampPosition(v) });
                    }
                  }}
                  aria-label="Stop position percent"
                  className="h-7 w-16 text-right text-xs"
                />
                %
              </label>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Remove stop"
                disabled={draft.length <= 2}
                onClick={() => removeStop(selected)}
                className="ml-auto text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" onClick={apply}>
          Apply gradient
        </Button>
      </div>
    </Dialog>
  );
}
