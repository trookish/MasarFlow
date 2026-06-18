"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ChevronsUpDown,
  Plus,
  Type,
  FileText,
  LayoutTemplate,
} from "lucide-react";
import { canvasRepo, notesRepo } from "@/lib/db/repos";
import type { CanvasNode } from "@/lib/db/schema";
import { useActiveProjectId } from "@/lib/hooks/use-project";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

type CanvasNodeData = {
  text?: string;
  title?: string;
  excerpt?: string;
  onChange?: (id: string, text: string) => void;
};

function TextNode({ id, data }: NodeProps<Node<CanvasNodeData>>) {
  return (
    <div className="min-h-[80px] w-56 rounded-md border border-border bg-card p-2 shadow-sm">
      <Handle type="target" position={Position.Left} />
      <textarea
        defaultValue={data.text ?? ""}
        onBlur={(e) => data.onChange?.(id, e.target.value)}
        placeholder="Type…"
        className="h-full min-h-[64px] w-full resize-none bg-transparent text-xs outline-none placeholder:text-muted-foreground"
      />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function NoteRefNode({ data }: NodeProps<Node<CanvasNodeData>>) {
  return (
    <div className="w-56 rounded-md border border-primary/40 bg-card p-2.5 shadow-sm">
      <Handle type="target" position={Position.Left} />
      <div className="flex items-center gap-1.5 text-xs font-medium">
        <FileText className="h-3.5 w-3.5 text-primary" />
        <span className="truncate">{data.title ?? "Note"}</span>
      </div>
      {data.excerpt ? (
        <p className="mt-1 line-clamp-3 text-[11px] text-muted-foreground">
          {data.excerpt}
        </p>
      ) : null}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { textNode: TextNode, noteNode: NoteRefNode };

function CanvasBoardInner() {
  const projectId = useActiveProjectId();
  const router = useRouter();
  const searchParams = useSearchParams();
  const canvasIdParam = searchParams.get("canvas");
  const { resolvedTheme } = useTheme();

  const canvases = useLiveQuery(
    () => canvasRepo.listByProject(projectId),
    [projectId],
  );
  const canvasId = canvasIdParam ?? canvases?.[0]?.id ?? null;

  const dbNodes = useLiveQuery(() => canvasRepo.nodes(canvasId), [canvasId]);
  const dbEdges = useLiveQuery(() => canvasRepo.edges(canvasId), [canvasId]);
  const projectNotes = useLiveQuery(
    () => notesRepo.listByProject(projectId),
    [projectId],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<CanvasNodeData>>(
    [],
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const seededRef = useRef<string | null>(null);

  const persistText = useCallback((id: string, text: string) => {
    void canvasRepo.updateNode(id, { data: { text } });
  }, []);

  const toFlowNode = useCallback(
    (n: CanvasNode): Node<CanvasNodeData> => ({
      id: n.id,
      type: n.type === "note" ? "noteNode" : "textNode",
      position: { x: n.x, y: n.y },
      data: { ...(n.data as CanvasNodeData), onChange: persistText },
    }),
    [persistText],
  );

  // Seed React Flow state once per canvas from the database.
  useEffect(() => {
    if (!canvasId || dbNodes === undefined || dbEdges === undefined) return;
    if (seededRef.current === canvasId) return;
    seededRef.current = canvasId;
    setNodes(dbNodes.map(toFlowNode));
    setEdges(
      dbEdges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
      })),
    );
  }, [canvasId, dbNodes, dbEdges, toFlowNode, setNodes, setEdges]);

  const onConnect = useCallback(
    async (connection: Connection) => {
      if (!canvasId) return;
      const edge = await canvasRepo.addEdge({
        canvasId,
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle ?? null,
        targetHandle: connection.targetHandle ?? null,
      });
      setEdges((es) => addEdge({ ...connection, id: edge.id }, es));
    },
    [canvasId, setEdges],
  );

  // Cascade new nodes so they don't stack exactly on top of each other.
  function nextPosition() {
    const i = nodes.length;
    return { x: 100 + (i % 6) * 48, y: 90 + (i % 6) * 44 };
  }

  async function addTextNode() {
    if (!canvasId) return;
    const pos = nextPosition();
    const node = await canvasRepo.addNode({
      canvasId,
      type: "text",
      x: pos.x,
      y: pos.y,
      data: { text: "New note" },
    });
    setNodes((ns) => [...ns, toFlowNode(node)]);
  }

  async function addNoteNode(noteId: string, title: string, excerpt: string) {
    if (!canvasId) return;
    const pos = nextPosition();
    const node = await canvasRepo.addNode({
      canvasId,
      type: "note",
      x: pos.x,
      y: pos.y,
      data: { noteId, title, excerpt },
    });
    setNodes((ns) => [...ns, toFlowNode(node)]);
  }

  async function newCanvas() {
    if (!projectId) return;
    const canvas = await canvasRepo.create({
      projectId,
      name: `Canvas ${(canvases?.length ?? 0) + 1}`,
    });
    router.replace(`/brain/canvas?canvas=${canvas.id}`);
  }

  if (!projectId) return null;

  if ((canvases?.length ?? 0) === 0) {
    return (
      <EmptyState
        icon={LayoutTemplate}
        title="No canvas yet"
        description="Create a visual canvas to arrange notes, text cards, and connections."
        action={
          <Button onClick={newCanvas}>
            <Plus className="h-4 w-4" /> New canvas
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <DropdownMenu>
          <DropdownMenuTrigger>
            <button
              type="button"
              className="flex h-8 items-center gap-2 rounded-md border border-border bg-card px-2.5 text-sm hover:bg-accent"
            >
              <LayoutTemplate className="h-3.5 w-3.5 text-primary" />
              <span className="max-w-[12rem] truncate">
                {canvases?.find((c) => c.id === canvasId)?.name ?? "Canvas"}
              </span>
              <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-60">
            <DropdownMenuLabel>Canvases</DropdownMenuLabel>
            {(canvases ?? []).map((c) => (
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

        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={addTextNode}>
            <Type className="h-3.5 w-3.5" /> Text
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger>
              <Button variant="outline" size="sm">
                <FileText className="h-3.5 w-3.5" /> Note
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="max-h-72 w-60 overflow-y-auto"
            >
              <DropdownMenuLabel>Add note card</DropdownMenuLabel>
              {(projectNotes ?? []).length === 0 ? (
                <div className="px-2 py-2 text-xs text-muted-foreground">
                  No notes yet.
                </div>
              ) : (
                (projectNotes ?? []).map((n) => (
                  <DropdownMenuItem
                    key={n.id}
                    onSelect={() => addNoteNode(n.id, n.title, n.excerpt)}
                  >
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate">{n.title}</span>
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDragStop={(_, node) =>
            void canvasRepo.updateNode(node.id, {
              x: node.position.x,
              y: node.position.y,
            })
          }
          onNodesDelete={(deleted) =>
            deleted.forEach((n) => void canvasRepo.removeNode(n.id))
          }
          onEdgesDelete={(deleted) =>
            deleted.forEach((e) => void canvasRepo.removeEdge(e.id))
          }
          nodeTypes={nodeTypes}
          colorMode={resolvedTheme === "light" ? "light" : "dark"}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={18} />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>
    </div>
  );
}

export function CanvasBoard() {
  return (
    <ReactFlowProvider>
      <CanvasBoardInner />
    </ReactFlowProvider>
  );
}
