"use client";
import * as React from "react";
import Link from "next/link";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { FileText, Type, Image, Link as LinkIcon, Trash2, GripHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  CanvasNode as CanvasNodeType,
  CanvasNodeType as CanvasNodeTypeEnum,
  Note,
} from "@/lib/db/schema";

export interface CanvasNodeData extends Record<string, unknown> {
  node: CanvasNodeType;
  note?: Note;
  onDelete?: (id: string) => void;
}

const TYPE_META: Record<
  CanvasNodeTypeEnum,
  {
    label: string;
    icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
    color: string;
  }
> = {
  note: { label: "Note", icon: FileText, color: "var(--graph-note)" },
  text: { label: "Text", icon: Type, color: "var(--graph-doc)" },
  image: { label: "Image", icon: Image, color: "var(--graph-memory)" },
  link: { label: "Link", icon: LinkIcon, color: "var(--graph-system)" },
};

function NodeChrome({
  node,
  selected,
  children,
  onDelete,
}: {
  node: CanvasNodeType;
  selected?: boolean;
  children: React.ReactNode;
  onDelete?: (id: string) => void;
}) {
  const meta = TYPE_META[node.type];
  const Icon = meta.icon;
  return (
    <div
      className={cn(
        "group bg-card relative flex flex-col overflow-hidden rounded-lg border shadow-sm transition-all",
        selected
          ? "border-primary ring-primary/30 ring-2"
          : "border-border hover:border-foreground/30",
      )}
      style={{ width: node.width || 240 }}
    >
      <Handle type="target" position={Position.Top} className="!bg-border !h-2 !w-2" />
      <Handle type="source" position={Position.Bottom} className="!bg-border !h-2 !w-2" />
      <Handle type="target" position={Position.Left} className="!bg-border !h-2 !w-2" id="l" />
      <Handle type="source" position={Position.Right} className="!bg-border !h-2 !w-2" id="r" />

      <div
        className="flex items-center justify-between border-b px-2.5 py-1.5"
        style={{ borderColor: "color-mix(in oklch, var(--border) 80%, transparent)" }}
      >
        <div className="flex items-center gap-1.5">
          <Icon className="h-3 w-3" style={{ color: meta.color }} />
          <span className="text-muted-foreground text-[10px] font-medium tracking-wider uppercase">
            {meta.label}
          </span>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <div className="cursor-grab p-0.5 active:cursor-grabbing">
            <GripHorizontal className="text-muted-foreground h-3 w-3" />
          </div>
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(node.id);
              }}
              className="text-muted-foreground hover:text-danger rounded p-0.5 transition-colors"
              aria-label="Delete node"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <div className="p-3">{children}</div>
    </div>
  );
}

function NoteNode({ node, note, selected, onDelete }: CanvasNodeData & { selected?: boolean }) {
  return (
    <NodeChrome node={node} selected={selected} onDelete={onDelete}>
      {note ? (
        <Link href={`/brain/${note.id}`} className="block hover:opacity-90">
          <h4 className="text-sm leading-snug font-semibold">{note.title}</h4>
          <p className="text-muted-foreground mt-1 line-clamp-3 text-xs text-pretty">
            {note.excerpt || note.body.replace(/[#>*`]/g, "").slice(0, 140)}
          </p>
        </Link>
      ) : (
        <div className="text-muted-foreground text-xs">Note not found</div>
      )}
    </NodeChrome>
  );
}

function TextNode({ node, selected, onDelete }: CanvasNodeData & { selected?: boolean }) {
  return (
    <NodeChrome node={node} selected={selected} onDelete={onDelete}>
      <p className="text-sm text-pretty whitespace-pre-wrap">{node.content}</p>
    </NodeChrome>
  );
}

function ImageNode({ node, selected, onDelete }: CanvasNodeData & { selected?: boolean }) {
  const url = node.url || node.content;
  return (
    <NodeChrome node={node} selected={selected} onDelete={onDelete}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt="Canvas image"
          className="h-auto w-full rounded object-cover"
          style={{ maxHeight: 320 }}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <div className="text-muted-foreground text-xs">No image URL</div>
      )}
    </NodeChrome>
  );
}

function LinkNode({ node, selected, onDelete }: CanvasNodeData & { selected?: boolean }) {
  const url = node.url || node.content;
  const isValid = url && /^https?:\/\//.test(url);
  return (
    <NodeChrome node={node} selected={selected} onDelete={onDelete}>
      {isValid ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary text-sm break-all hover:underline"
        >
          {node.content || url}
        </a>
      ) : (
        <div className="text-muted-foreground text-xs">Invalid link</div>
      )}
    </NodeChrome>
  );
}

export function CanvasNodeView(props: NodeProps) {
  const data = props.data as unknown as CanvasNodeData;
  const { node, note, onDelete } = data;
  const selected = props.selected;

  switch (node.type) {
    case "note":
      return <NoteNode node={node} note={note} selected={selected} onDelete={onDelete} />;
    case "text":
      return <TextNode node={node} selected={selected} onDelete={onDelete} />;
    case "image":
      return <ImageNode node={node} selected={selected} onDelete={onDelete} />;
    case "link":
      return <LinkNode node={node} selected={selected} onDelete={onDelete} />;
    default:
      return <TextNode node={node} selected={selected} onDelete={onDelete} />;
  }
}
