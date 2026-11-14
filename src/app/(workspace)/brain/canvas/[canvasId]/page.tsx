"use client";
import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Brain, ArrowLeft, MoreHorizontal, Trash2, Pencil } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CanvasBoard } from "@/components/brain/canvas-board";
import { useActiveProject } from "@/lib/db/repos/projects";
import { useCanvas, useCanvasNodes, useCanvasEdges, deleteCanvas, upsertCanvas } from "@/lib/db/repos/canvases";
import { useNotes } from "@/lib/db/repos/notes";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function CanvasDetailPage() {
  const params = useParams();
  const router = useRouter();
  const canvasId = typeof params.canvasId === "string" ? params.canvasId : undefined;
  const project = useActiveProject();
  const canvas = useCanvas(canvasId);
  const nodes = useCanvasNodes(canvasId);
  const edges = useCanvasEdges(canvasId);
  const notes = useNotes(project?.id);
  const [isRenaming, setIsRenaming] = React.useState(false);
  const [name, setName] = React.useState("");

  const startRenaming = () => {
    if (canvas) setName(canvas.name);
    startRenaming();
  };

  const onRename = async () => {
    if (!canvas || !name.trim()) return;
    await upsertCanvas({ ...canvas, name: name.trim(), updatedAt: Date.now() });
    setIsRenaming(false);
  };

  const onDelete = async () => {
    if (!canvas) return;
    await deleteCanvas(canvas.id);
    toast.success("Canvas deleted");
    router.push("/brain?tab=canvases");
  };

  const isLoaded = canvas !== undefined && nodes !== undefined;
  const isMismatch = canvas && project && canvas.projectId !== project.id;

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col">
      <PageHeader
        icon={Brain}
        eyebrow="Brain / Canvas"
        title={
          isRenaming && canvas ? (
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={onRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") onRename();
                if (e.key === "Escape") {
                  setName(canvas.name);
                  setIsRenaming(false);
                }
              }}
              className="h-8 w-72 text-2xl font-semibold tracking-tight"
            />
          ) : (
            <div className="flex items-center gap-3">
              {canvas ? (
                <button
                  onClick={() => startRenaming()}
                  className="hover:text-muted-foreground cursor-pointer transition-colors"
                >
                  {canvas.name}
                </button>
              ) : (
                "Canvas"
              )}
              {canvas && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground"
                  onClick={() => startRenaming()}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )
        }
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild className="gap-1.5">
              <Link href="/brain?tab=canvases">
                <ArrowLeft className="h-4 w-4" /> Back
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => startRenaming()}>
                  <Pencil className="h-4 w-4" /> Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={onDelete}
                  className="text-[color:var(--danger)] focus:text-[color:var(--danger)]"
                >
                  <Trash2 className="h-4 w-4" /> Delete canvas
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      <div className="relative min-h-0 flex-1">
        {!isLoaded ? (
          <div className="grid h-full place-items-center">
            <div className="text-muted-foreground text-sm">Loading canvas…</div>
          </div>
        ) : isMismatch ? (
          <div className="grid h-full place-items-center">
            <div className="text-muted-foreground text-sm">
              Canvas does not belong to this project.
            </div>
          </div>
        ) : canvas && project ? (
          <CanvasBoard
            canvasId={canvas.id}
            projectId={project.id}
            nodes={nodes}
            edges={edges ?? []}
            notes={notes ?? []}
          />
        ) : (
          <div className="grid h-full place-items-center">
            <div className="text-muted-foreground text-sm">Canvas not found.</div>
          </div>
        )}
      </div>
    </div>
  );
}
