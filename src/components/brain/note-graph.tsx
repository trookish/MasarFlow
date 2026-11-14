"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node as FlowNode,
  type Edge,
  type NodeTypes,
  type NodeMouseHandler,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Filter, Share2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NoteTypeBadge } from "@/components/common/badges";
import { cn } from "@/lib/utils";
import { NOTE_TYPES, type Note, type NoteType } from "@/lib/db/schema";
import { NOTE_TYPE_ACCENT, buildNoteGraph, buildLocalGraph } from "@/lib/brain/graph";

export interface NoteNodeData extends Record<string, unknown> {
  note: Note;
}

type NoteNode = FlowNode<NoteNodeData, "note">;

function NoteNode({ data, selected }: NodeProps<NoteNode>) {
  const { note } = data;
  const color = NOTE_TYPE_ACCENT[note.type];

  return (
    <div
      className={cn(
        "group relative flex items-center gap-2 rounded-full border px-2.5 py-1 transition-all",
        selected
          ? "border-foreground/50 bg-card shadow-md"
          : "border-border/60 bg-card/90 hover:border-foreground/40 hover:bg-card",
      )}
      style={{ borderLeftColor: color, borderLeftWidth: "3px" }}
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="max-w-[140px] truncate text-[11px] font-medium">{note.title}</span>
    </div>
  );
}

const nodeTypes: NodeTypes = { note: NoteNode };

interface NoteGraphInnerProps {
  notes: Note[];
  localNoteId?: string;
  className?: string;
  showMinimap?: boolean;
}

function NoteGraphInner({
  notes,
  localNoteId,
  className,
  showMinimap = true,
}: NoteGraphInnerProps) {
  const router = useRouter();
  const isLocal = !!localNoteId;
  const initialNodes = React.useMemo<NoteNode[]>(
    () =>
      (isLocal
        ? buildLocalGraph(notes, localNoteId, 320, 240).nodes
        : buildNoteGraph(notes, 960, 640).nodes) as unknown as NoteNode[],
    [notes, localNoteId, isLocal],
  );
  const initialEdges = React.useMemo<Edge[]>(
    () =>
      isLocal
        ? buildLocalGraph(notes, localNoteId, 320, 240).edges
        : buildNoteGraph(notes, 960, 640).edges,
    [notes, localNoteId, isLocal],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<NoteNode>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [enabledTypes, setEnabledTypes] = React.useState<Set<NoteType>>(() => new Set(NOTE_TYPES));
  const [hovered, setHovered] = React.useState<Note | null>(null);
  const { fitView } = useReactFlow();

  React.useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
    requestAnimationFrame(() => fitView({ padding: 0.15, duration: 250 }));
  }, [initialNodes, initialEdges, setNodes, setEdges, fitView]);

  React.useEffect(() => {
    setNodes((prev) =>
      prev.map((n) => {
        const hidden = !enabledTypes.has((n.data as NoteNodeData).note.type);
        return { ...n, hidden };
      }),
    );
    setEdges((prev) =>
      prev.map((e) => {
        const source = nodes.find((n) => n.id === e.source);
        const target = nodes.find((n) => n.id === e.target);
        const hidden = !source || !target || !!source.hidden || !!target.hidden;
        return { ...e, hidden };
      }),
    );
  }, [enabledTypes, setNodes, setEdges, nodes]);

  const onNodeClick: NodeMouseHandler<NoteNode> = React.useCallback(
    (_event, node) => {
      router.push(`/brain/${node.id}`);
    },
    [router],
  );

  const onNodeMouseEnter: NodeMouseHandler<NoteNode> = React.useCallback(
    (_event, node) => {
      const note = (node.data as NoteNodeData).note;
      setHovered(note);
      setEdges((prev) =>
        prev.map((e) => {
          const connected = e.source === node.id || e.target === node.id;
          return {
            ...e,
            animated: connected,
            style: {
              ...e.style,
              stroke: connected ? "var(--primary)" : "var(--border)",
              strokeOpacity: connected ? 1 : 0.35,
              strokeWidth: connected ? 2 : 1,
            },
          };
        }),
      );
    },
    [setEdges],
  );

  const onNodeMouseLeave = React.useCallback(() => {
    setHovered(null);
    setEdges((prev) =>
      prev.map((e) => ({
        ...e,
        animated: false,
        style: {
          ...e.style,
          stroke: "var(--border)",
          strokeOpacity: 0.5,
          strokeWidth: 1,
        },
      })),
    );
  }, [setEdges]);

  const toggleType = (type: NoteType) => {
    setEnabledTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const counts = React.useMemo(() => {
    const map = new Map<NoteType, number>();
    for (const t of NOTE_TYPES) map.set(t, 0);
    for (const n of notes) map.set(n.type, (map.get(n.type) ?? 0) + 1);
    return map;
  }, [notes]);

  if (notes.length === 0) {
    return (
      <div
        className={cn(
          "border-border text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm",
          className,
        )}
      >
        No notes to graph yet.
      </div>
    );
  }

  return (
    <div className={cn("relative flex min-h-[360px] flex-col gap-3", className)}>
      {!isLocal && (
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Filter className="h-3 w-3" /> Filters
            </CardDescription>
            <CardTitle className="mt-1 text-sm">Note types</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {NOTE_TYPES.map((type) => {
              const enabled = enabledTypes.has(type);
              return (
                <button
                  key={type}
                  onClick={() => toggleType(type)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium transition-colors",
                    enabled
                      ? "border-foreground/20 bg-foreground/5 text-foreground"
                      : "border-border text-muted-foreground line-through opacity-60",
                  )}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: NOTE_TYPE_ACCENT[type] }}
                  />
                  <span className="capitalize">{type}</span>
                  <span className="text-muted-foreground font-mono text-[10px]">
                    {counts.get(type) ?? 0}
                  </span>
                </button>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card className="relative flex-1 overflow-hidden">
        <CardContent className="h-full p-0">
          <div className="absolute inset-0">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              onNodeMouseEnter={onNodeMouseEnter}
              onNodeMouseLeave={onNodeMouseLeave}
              nodeTypes={nodeTypes}
              fitView
              attributionPosition="bottom-right"
              minZoom={0.2}
              maxZoom={2}
              proOptions={{ hideAttribution: true }}
            >
              <Background color="var(--border)" gap={24} size={1} />
              <Controls />
              {showMinimap && (
                <MiniMap
                  nodeColor={(n) =>
                    NOTE_TYPE_ACCENT[(n.data as { note: Note }).note.type as NoteType]
                  }
                  maskColor="var(--background)"
                  className="!right-3 !bottom-3 !h-20 !w-28 rounded-md"
                  pannable
                  zoomable
                />
              )}
            </ReactFlow>
          </div>

          {hovered && (
            <div className="border-border bg-popover/95 pointer-events-none absolute top-3 left-3 z-10 max-w-[260px] rounded-lg border p-3 shadow-md backdrop-blur">
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: NOTE_TYPE_ACCENT[hovered.type] }}
                />
                <NoteTypeBadge type={hovered.type} />
              </div>
              <h4 className="mt-1.5 text-sm font-semibold">{hovered.title}</h4>
              {hovered.excerpt && (
                <p className="text-muted-foreground mt-1 line-clamp-3 text-[11px] text-pretty">
                  {hovered.excerpt}
                </p>
              )}
              {hovered.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {hovered.tags.slice(0, 6).map((t) => (
                    <Badge key={t} variant="outline" className="text-[9px]">
                      #{t}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {!isLocal && (
        <div className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
          <Share2 className="h-3 w-3" />
          <span>Click a node to open the note. Hover to highlight connections.</span>
        </div>
      )}
    </div>
  );
}

export function NoteGraph(props: NoteGraphInnerProps) {
  return (
    <ReactFlowProvider>
      <NoteGraphInner {...props} />
    </ReactFlowProvider>
  );
}
