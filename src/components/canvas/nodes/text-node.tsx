"use client";

import { memo, useState, useRef, useEffect } from "react";
import { Handle, Position, NodeResizer, type NodeProps, type Node } from "@xyflow/react";
import { RichMarkdownEditor } from "@/components/brain/rich-markdown-editor";
import { MarkdownPreview } from "@/components/brain/markdown-preview";
import { usePageSettings } from "@/lib/stores/page-settings";
import type { TextNodeData } from "./types";
import { nodeColorStyle } from "./types";
import { useIsLowDetail } from "../use-lod";

export type TextNodeType = Node<TextNodeData, "textNode">;

function TextNodeComponent({
  id,
  data,
  selected,
}: NodeProps<TextNodeType>) {
  const [editing, setEditing] = useState(Boolean(data.newCard));
  const containerRef = useRef<HTMLDivElement>(null);
  const text = data.text ?? "";
  const shadow = data.shadow !== false;
  const lodThreshold = usePageSettings((s) => s.canvas.lodThreshold);
  const lowDetail = useIsLowDetail(lodThreshold);

  // Freshly created cards open in edit mode; clear the one-shot flag once
  // it has been consumed.
  useEffect(() => {
    if (data.newCard) {
      data.onDataChange?.(id, { ...data, newCard: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.newCard]);

  useEffect(() => {
    if (!editing) return;
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as globalThis.Node)) {
        setEditing(false);
      }
    }
    const t = setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onDown);
    };
  }, [editing]);

  function handleChange(value: string) {
    data.onDataChange?.(id, { ...data, text: value });
  }

  // LOD: simplified preview when zoomed out — no CodeMirror, no MarkdownPreview.
  if (lowDetail && !editing) {
    const firstLine = text.split("\n").find((l) => l.trim()) ?? "";
    const stripped = firstLine.replace(/^#+\s*/, "").replace(/\*\*|__|~~|\[\[|\]\]/g, "");
    return (
      <div
        style={nodeColorStyle(data.color)}
        className={
          "flex h-full w-full items-center overflow-hidden rounded-lg border border-border bg-card px-2 " +
          (shadow ? "shadow-sm " : "") +
          (selected ? "ring-2 ring-primary/40 " : "")
        }
      >
        <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5" />
        <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5" />
        <span className="truncate text-[10px] text-muted-foreground">
          {stripped || "Empty"}
        </span>
      </div>
    );
  }

  return (
    <>
      <NodeResizer
        isVisible={!!selected}
        minWidth={160}
        minHeight={80}
        lineClassName="!border-primary/40"
        handleClassName="!h-2.5 !w-2.5 !rounded-sm !border !border-primary !bg-background"
      />
      <div
        ref={containerRef}
        style={nodeColorStyle(data.color)}
        className={
          "h-full w-full overflow-hidden rounded-lg border border-border bg-card transition-shadow " +
          (shadow ? "shadow-sm " : "") +
          (selected ? "ring-2 ring-primary/40 " : "")
        }
        onDoubleClick={() => setEditing(true)}
      >
        <Handle type="target" position={Position.Left} className="!h-2 !w-2" />
        <Handle type="source" position={Position.Right} className="!h-2 !w-2" />
        <Handle type="target" position={Position.Top} className="!h-2 !w-2" />
        <Handle type="source" position={Position.Bottom} className="!h-2 !w-2" />

        {editing ? (
          <div className="h-full w-full overflow-auto [&_.cm-content]:px-3 [&_.cm-content]:py-2 [&_.cm-content]:text-xs">
            <RichMarkdownEditor
              value={text}
              onChange={handleChange}
              suggestions={[]}
              placeholderText="Type…  / for commands, [[ to link notes"
              className="h-full"
            />
          </div>
        ) : text.trim() ? (
          <div
            className="h-full w-full overflow-hidden px-3 py-2 text-xs"
            onDoubleClick={() => setEditing(true)}
          >
            <MarkdownPreview content={text} className="!text-xs" />
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center px-3 py-2 text-xs text-muted-foreground">
            Double-click to edit
          </div>
        )}
      </div>
    </>
  );
}

export const TextNode = memo(TextNodeComponent);
