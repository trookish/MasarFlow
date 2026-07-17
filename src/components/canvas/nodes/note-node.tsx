"use client";

import { memo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useRouter } from "next/navigation";
import { Handle, Position, NodeResizer, type NodeProps, type Node } from "@xyflow/react";
import { FileText, ExternalLink, Pencil, Eye, EyeOff } from "lucide-react";
import { db } from "@/lib/db";
import { notesRepo } from "@/lib/db/repos";
import type { Note } from "@/lib/db/schema";
import { RichMarkdownEditor } from "@/components/brain/rich-markdown-editor";
import { MarkdownPreview } from "@/components/brain/markdown-preview";
import { usePageSettings } from "@/lib/stores/page-settings";
import type { NoteNodeData } from "./types";
import { nodeColorStyle } from "./types";
import { useIsLowDetail } from "../use-lod";

export type NoteNodeType = Node<NoteNodeData, "noteNode">;

type NoteMode = NonNullable<NoteNodeData["mode"]>;

const MODE_ICONS = {
  preview: Eye,
  editable: Pencil,
  readonly: EyeOff,
  heading: FileText,
} as const;

function NoteNodeComponent({
  id,
  data,
  selected,
}: NodeProps<NoteNodeType>) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const mode: NoteMode = data.mode ?? "preview";
  const shadow = data.shadow !== false;
  const lodThreshold = usePageSettings((s) => s.canvas.lodThreshold);
  const lowDetail = useIsLowDetail(lodThreshold);

  // Live-sync: the note card reflects the real note in IndexedDB.
  const note = useLiveQuery(
    async () => (data.noteId ? db.notes.get(data.noteId) : undefined),
    [data.noteId],
  ) as Note | undefined;

  const title = note?.title ?? data.title ?? "Note";
  const body = note?.body ?? data.body ?? "";
  const excerpt = note?.excerpt ?? data.excerpt ?? "";

  function setMode(m: NoteMode) {
    data.onDataChange?.(id, { ...data, mode: m });
  }

  function openFullNote() {
    if (data.noteId) {
      data.onOpenNote?.(data.noteId);
      router.push(`/brain?note=${data.noteId}`);
    }
  }

  function handleEdit(value: string) {
    if (data.noteId) {
      void notesRepo.update(data.noteId, { body: value });
    }
  }

  // LOD: title-only card when zoomed out — no live query, no markdown, no iframe.
  if (lowDetail) {
    return (
      <div
        style={nodeColorStyle(data.color)}
        className={
          "flex h-full w-full items-center gap-1.5 overflow-hidden rounded-lg border border-border bg-card px-2 " +
          (shadow ? "shadow-sm " : "") +
          (selected ? "ring-2 ring-primary/40 " : "")
        }
      >
        <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5" />
        <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5" />
        <FileText className="h-3 w-3 shrink-0 text-primary" />
        <span className="truncate text-[10px] font-medium">{title}</span>
      </div>
    );
  }

  return (
    <>
      <NodeResizer
        isVisible={!!selected}
        minWidth={180}
        minHeight={80}
        lineClassName="!border-primary/40"
        handleClassName="!h-2.5 !w-2.5 !rounded-sm !border !border-primary !bg-background"
      />
      <div
        style={nodeColorStyle(data.color)}
        className={
          "flex h-full w-full flex-col overflow-hidden rounded-lg border border-border bg-card transition-shadow " +
          (shadow ? "shadow-sm " : "") +
          (selected ? "ring-2 ring-primary/40 " : "")
        }
      >
        <Handle type="target" position={Position.Left} className="!h-2 !w-2" />
        <Handle type="source" position={Position.Right} className="!h-2 !w-2" />
        <Handle type="target" position={Position.Top} className="!h-2 !w-2" />
        <Handle type="source" position={Position.Bottom} className="!h-2 !w-2" />

        {/* Header: note icon + title + mode controls */}
        <div className="flex items-center gap-1.5 border-b border-border/50 px-2.5 py-1.5">
          <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate text-xs font-medium">{title}</span>
          <div className="flex items-center gap-0.5">
            {(["preview", "editable", "heading"] as NoteMode[]).map((m) => {
              const Icon = MODE_ICONS[m];
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={
                    "rounded p-0.5 transition-colors " +
                    (mode === m
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground")
                  }
                  title={m}
                >
                  <Icon className="h-3 w-3" />
                </button>
              );
            })}
            <button
              type="button"
              onClick={openFullNote}
              className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="Open full note"
            >
              <ExternalLink className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Body: mode-dependent */}
        <div className="min-h-0 flex-1 overflow-hidden">
          {mode === "heading" ? (
            <div className="flex h-full items-center px-2.5 py-2 text-xs text-muted-foreground">
              {excerpt || "No excerpt"}
            </div>
          ) : mode === "editable" ? (
            <div
              className="h-full w-full overflow-auto [&_.cm-content]:px-2.5 [&_.cm-content]:py-2 [&_.cm-content]:text-xs"
              onDoubleClick={() => setEditing(true)}
            >
              {editing ? (
                <RichMarkdownEditor
                  value={body}
                  onChange={handleEdit}
                  suggestions={[]}
                  placeholderText="Edit note…"
                  className="h-full"
                />
              ) : (
                <div
                  className="h-full w-full cursor-text px-2.5 py-2 text-xs"
                  onDoubleClick={() => setEditing(true)}
                >
                  <MarkdownPreview content={body} className="!text-xs" />
                </div>
              )}
            </div>
          ) : (
            // preview + readonly both show rendered markdown; readonly ignores edits.
            <div className="h-full w-full overflow-auto px-2.5 py-2 text-xs">
              <MarkdownPreview content={body} className="!text-xs" />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export const NoteNode = memo(NoteNodeComponent);
