"use client";
import * as React from "react";
import {
  ReactFlow,
  Background,
  Controls,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  useReactFlow,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
  type OnNodeDrag,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CanvasNodeView, type CanvasNodeData } from "./canvas-node";
import { AddNodeDialog } from "./add-node-dialog";
import { upsertCanvasNode, deleteCanvasNode, upsertCanvasEdge, deleteCanvasEdge } from "@/lib/db/repos/canvases";
import { getDb, type CanvasNode, type CanvasEdge, type CanvasNodeType, type Note } from "@/lib/db/schema";
import { uid } from "@/lib/utils";

const nodeTypes: NodeTypes = { canvas: CanvasNodeView };

interface CanvasBoardInnerProps {
  canvasId: string;
  projectId: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  notes: Note[];
}

type CanvasFlowNode = Node<CanvasNodeData, "canvas">;

function CanvasBoardInner({ canvasId, projectId, nodes, edges, notes }: CanvasBoardInnerProps) {
  const noteById = React.useMemo(() => {
    const map = new Map<string, Note>();
    for (const n of notes) map.set(n.id, n);
    return map;
  }, [notes]);

  const initialNodes = React.useMemo<CanvasFlowNode[]>(() => {
    return nodes.map((n) => ({
      id: n.id,
      type: "canvas",
      position: { x: n.x, y: n.y },
      data: {
        node: n,
        note: n.noteId ? noteById.get(n.noteId) : undefined,
        onDelete: handleDelete,
      } as unknown as CanvasNodeData,
      draggable: true,
      selectable: true,
    }));
  }, [nodes, noteById]);

  const initialEdges = React.useMemo<Edge[]>(() => {
    return edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      label: e.label || undefined,
      animated: true,
    }));
  }, [edges]);

  const [flowNodes, setNodes, onNodesChange] = useNodesState<CanvasFlowNode>(initialNodes);
  const [flowEdges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges);
  const wrapper = React.useRef<HTMLDivElement>(null);
  const { fitView } = useReactFlow();

  React.useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  React.useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

  React.useEffect(() => {
    const id = window.setTimeout(() => fitView({ padding: 0.12, duration: 300 }), 60);
    return () => window.clearTimeout(id);
  }, [canvasId, fitView]);

  function handleDelete(id: string) {
    deleteCanvasNode(id);
  }

  const onNodesDelete = React.useCallback((deletedNodes: CanvasFlowNode[]) => {
    for (const node of deletedNodes) {
      deleteCanvasNode(node.id);
    }
  }, []);

  const onEdgesDelete = React.useCallback((deletedEdges: Edge[]) => {
    for (const edge of deletedEdges) {
      deleteCanvasEdge(edge.id);
    }
  }, []);

  const onConnect = React.useCallback(
    async (params: Edge | Connection) => {
      setEdges((eds) => addEdge({ ...params, animated: true }, eds));
      const now = Date.now();
      const newEdge: CanvasEdge = {
        id: uid("cedge"),
        canvasId,
        source: params.source,
        target: params.target,
        sourceHandle: params.sourceHandle || null,
        targetHandle: params.targetHandle || null,
        label: null,
        createdAt: now,
      };
      await upsertCanvasEdge(newEdge);
      await getDb().canvases.update(canvasId, { updatedAt: now });
    },
    [canvasId, setEdges],
  );

  const onNodeDragStop: OnNodeDrag<CanvasFlowNode> = React.useCallback(
    (_event, node) => {
      const canvasNode = nodes.find((n) => n.id === node.id);
      if (!canvasNode) return;
      upsertCanvasNode({
        ...canvasNode,
        x: node.position.x,
        y: node.position.y,
        updatedAt: Date.now(),
      });
    },
    [nodes],
  );

  const onSelectionDragStop = React.useCallback(
    (_event: React.MouseEvent | React.TouchEvent, dsNodes: CanvasFlowNode[]) => {
      for (const n of dsNodes) {
        const canvasNode = nodes.find((cn) => cn.id === n.id);
        if (!canvasNode) continue;
        upsertCanvasNode({
          ...canvasNode,
          x: n.position.x,
          y: n.position.y,
          updatedAt: Date.now(),
        });
      }
    },
    [nodes],
  );

  const addNode = React.useCallback(
    async (params: { type: CanvasNodeType; content: string; url?: string; noteId?: string }) => {
      const now = Date.now();
      const count = nodes.length;
      const newNode: CanvasNode = {
        id: uid("cnode"),
        canvasId,
        projectId,
        type: params.type,
        x: 40 + (count % 4) * 60,
        y: 40 + Math.floor(count / 4) * 60,
        width: params.type === "image" ? 320 : 260,
        height: null,
        content: params.content || "",
        noteId: params.noteId || null,
        url: params.url || null,
        createdAt: now,
        updatedAt: now,
      };
      await upsertCanvasNode(newNode);
      await getDb().canvases.update(canvasId, { updatedAt: now });
    },
    [canvasId, projectId, nodes.length],
  );

  return (
    <div ref={wrapper} className="relative h-full w-full">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        nodeTypes={nodeTypes}
        onNodeDragStop={onNodeDragStop}
        onSelectionDragStop={onSelectionDragStop}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.15}
        maxZoom={2.5}
        deleteKeyCode="Delete"
        selectionKeyCode="Shift"
        multiSelectionKeyCode="Shift"
      >
        <Background gap={24} size={1} color="color-mix(in oklch, var(--border) 80%, transparent)" />
        <Controls position="bottom-right" showInteractive={false} className="!shadow-md" />
      </ReactFlow>

      <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
        <AddNodeDialog notes={notes} onAdd={addNode}>
          <Button size="sm" className="gap-1.5 shadow-sm">
            <Plus className="h-4 w-4" /> Add node
          </Button>
        </AddNodeDialog>
      </div>
    </div>
  );
}

export interface CanvasBoardProps {
  canvasId: string;
  projectId: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  notes: Note[];
}

export function CanvasBoard(props: CanvasBoardProps) {
  return (
    <ReactFlowProvider>
      <CanvasBoardInner {...props} />
    </ReactFlowProvider>
  );
}
