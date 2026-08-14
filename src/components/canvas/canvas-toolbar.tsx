"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ChevronsUpDown,
  Plus,
  LayoutTemplate,
  Download,
  Upload,
  Grid3x3,
  Settings2,
} from "lucide-react";
import { canvasRepo } from "@/lib/db/repos";
import type { Canvas } from "@/lib/db/schema";
import {
  toCanvasFile,
  fromCanvasFile,
  serializeCanvas,
  parseCanvasFile,
} from "@/lib/canvas-file";
import { usePageSettings } from "@/lib/stores/page-settings";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils/cn";

function slugifyName(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "canvas"
  );
}

/** Export the current canvas as a downloadable `.canvas` file. */
async function exportCanvasFile(
  canvasId: string,
  canvas: Pick<Canvas, "name" | "description">,
) {
  const [nodes, edges] = await Promise.all([
    canvasRepo.nodes(canvasId),
    canvasRepo.edges(canvasId),
  ]);
  const file = toCanvasFile(canvas, nodes, edges);
  const blob = new Blob([serializeCanvas(file)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slugifyName(canvas.name)}.canvas`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Floating Milanote-style header: canvas switcher on the left, file ops and
 * display settings on the right. Card creation moved to the click-to-add
 * palette and the left quick-add rail so the board stays clean.
 */
export function CanvasToolbar({
  projectId,
  canvases,
  canvasId,
  currentName,
  onAddWeb,
}: {
  projectId: string | null;
  canvases: Canvas[];
  canvasId: string | null;
  currentName: string;
  /** Opens the board's "Add link" dialog. */
  onAddWeb: () => void;
}) {
  const router = useRouter();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [importing, setImporting] = React.useState(false);
  const { canvas: settings, update } = usePageSettings();

  async function newCanvas() {
    if (!projectId) return;
    const canvas = await canvasRepo.create({
      projectId,
      name: `Canvas ${(canvases?.length ?? 0) + 1}`,
    });
    router.replace(`/brain/canvas?canvas=${canvas.id}`);
  }

  async function handleImportFile(file: File) {
    if (!projectId) return;
    setImporting(true);
    try {
      const text = await file.text();
      const parsed = parseCanvasFile(text);
      const imported = fromCanvasFile(
        parsed,
        file.name.replace(/\.canvas$/i, ""),
      );
      const canvas = await canvasRepo.create({
        projectId,
        name: imported.name,
        description: imported.description,
      });
      for (const n of imported.nodes) {
        await canvasRepo.addNode({ canvasId: canvas.id, ...n });
      }
      for (const e of imported.edges) {
        await canvasRepo.addEdge({ canvasId: canvas.id, ...e });
      }
      router.replace(`/brain/canvas?canvas=${canvas.id}`);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 rounded-xl border border-border bg-card/85 p-1.5 shadow-lg backdrop-blur">
      {/* Canvas switcher */}
      <DropdownMenu>
        <DropdownMenuTrigger>
          <button
            type="button"
            className="flex h-8 items-center gap-2 rounded-lg px-2.5 text-sm font-medium hover:bg-accent"
          >
            <LayoutTemplate className="h-3.5 w-3.5 text-primary" />
            <span className="max-w-[12rem] truncate">{currentName}</span>
            <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-60">
          <DropdownMenuLabel>Canvases</DropdownMenuLabel>
          {canvases.map((c) => (
            <DropdownMenuItem
              key={c.id}
              active={c.id === canvasId}
              onSelect={() => router.replace(`/brain/canvas?canvas=${c.id}`)}
            >
              <LayoutTemplate className="h-4 w-4" />
              <span className="truncate">{c.name}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={newCanvas}>
            <Plus className="h-4 w-4" /> New canvas
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="mx-0.5 h-5 w-px bg-border" />

      {/* Link card (image/file/text/note live on the left rail + palette) */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onAddWeb}
        title="Add a web page card"
      >
        <span className="mr-1 text-muted-foreground">+</span> Link
      </Button>

      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          disabled={!canvasId || importing}
          onClick={() =>
            void exportCanvasFile(canvasId!, {
              name: currentName,
              description: "",
            })
          }
          title="Export as .canvas file"
        >
          <Download className="h-3.5 w-3.5" /> Export
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={importing || !projectId}
          onClick={() => fileInputRef.current?.click()}
          title="Import a .canvas file"
        >
          <Upload className="h-3.5 w-3.5" /> Import
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".canvas,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleImportFile(f);
            e.target.value = "";
          }}
        />

        {/* Canvas settings (grid + snap + LOD seam) */}
        <DropdownMenu>
          <DropdownMenuTrigger>
            <Button variant="ghost" size="icon-sm" aria-label="Canvas settings">
              <Settings2 className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Display</DropdownMenuLabel>
            <SettingToggle
              label="Background grid"
              icon={Grid3x3}
              checked={settings.showGrid}
              onChange={(v) => update("canvas", { showGrid: v })}
            />
            <SettingToggle
              label="Snap to grid"
              icon={Grid3x3}
              checked={settings.snapToGrid}
              onChange={(v) => update("canvas", { snapToGrid: v })}
            />
            <SettingToggle
              label="Snap to objects"
              icon={Grid3x3}
              checked={settings.snapToObjects}
              onChange={(v) => update("canvas", { snapToObjects: v })}
            />
            <SettingToggle
              label="Card shadows"
              icon={Grid3x3}
              checked={settings.cardShadows}
              onChange={(v) => update("canvas", { cardShadows: v })}
            />
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Grid size</DropdownMenuLabel>
            <div className="flex items-center gap-1 px-2 py-1">
              {[16, 20, 24, 32].map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => update("canvas", { gridSize: g })}
                  className={cn(
                    "rounded px-2 py-1 text-xs tabular-nums hover:bg-accent",
                    settings.gridSize === g &&
                      "bg-primary/10 font-medium text-primary",
                  )}
                >
                  {g}
                </button>
              ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function SettingToggle({
  label,
  icon: Icon,
  checked,
  onChange,
}: {
  label: string;
  icon: typeof Grid3x3;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
    >
      <Icon
        className={cn(
          "h-4 w-4",
          checked ? "text-primary" : "text-muted-foreground",
        )}
      />
      <span className="flex-1">{label}</span>
      <span
        className={cn(
          "h-4 w-7 rounded-full p-0.5 transition-colors",
          checked ? "bg-primary" : "bg-muted",
        )}
      >
        <span
          className={cn(
            "block h-3 w-3 rounded-full bg-background transition-transform",
            checked && "translate-x-3",
          )}
        />
      </span>
    </button>
  );
}
