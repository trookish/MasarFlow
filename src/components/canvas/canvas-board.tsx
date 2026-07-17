"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  MarkerType,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useOnSelectionChange,
  type Node,
  type Edge,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Plus, LayoutTemplate } from "lucide-react";
import { canvasRepo, notesRepo } from "@/lib/db/repos";
import type { CanvasNode } from "@/lib/db/schema";
import { useActiveProjectId } from "@/lib/hooks/use-project";
import { usePageSettings } from "@/lib/stores/page-settings";
import { useDebouncedCallback } from "@/lib/hooks/use-debounced";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CanvasToolbar } from "./canvas-toolbar";
import { canvasNodeTypes, rfTypeFor } from "./nodes";
import { fileToMediaNodeData } from "./nodes/media-node";
import type { BaseNodeData } from "./nodes/types";
import { CanvasContextMenu, type AlignMode } from "./canvas-context-menu";
import {
  alignLeft,
  alignRight,
  alignTop,
  alignBottom,
  alignCenterH,
  alignCenterV,
  distributeH,
  distributeV,
  autoGrid,
} from "./canvas-alignment";
import { useCanvasShortcuts } from "./canvas-shortcuts";
import {
  setCanvasAIContext,
  type CanvasAIContext,
  type CanvasNodeSummary,
} from "@/lib/canvas-ai";

type AnyNodeData = Record<string, unknown> & BaseNodeData;

/* ── Edge defaults ────────────────────────────────────────────────────────── */

const EDGE_DEFAULTS = {
  type: "default" as const,
  markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
};

/* ── Board ────────────────────────────────────────────────────────────────── */

function CanvasBoardInner() {
  const projectId = useActiveProjectId();
  const router = useRouter();
  const searchParams = useSearchParams();
  const canvasIdParam = searchParams.get("canvas");
  const { resolvedTheme } = useTheme();
  const { canvas: settings } = usePageSettings();
  const { screenToFlowPosition, getNodes } = useReactFlow();

  const canvases = useLiveQuery(
    () => canvasRepo.listByProject(projectId),
    [projectId],
  );
  const canvasId = canvasIdParam ?? canvases?.[0]?.id ?? null;
  const currentCanvas = canvases?.find((c) => c.id === canvasId);

  const dbNodes = useLiveQuery(() => canvasRepo.nodes(canvasId), [canvasId]);
  const dbEdges = useLiveQuery(() => canvasRepo.edges(canvasId), [canvasId]);
  const projectNotes = useLiveQuery(
    () => notesRepo.listByProject(projectId),
    [projectId],
  );

  const [nodes, setNodesState, onNodesChange] = useNodesState<
    Node<AnyNodeData>
  >([]);
  const [edges, setEdgesState, onEdgesChange] = useEdgesState<Edge>([]);
  const seededRef = useRef<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    nodeId: string | null;
    multiSelect: boolean;
  } | null>(null);

  // Selection state (for multi-select context menu)
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);

  useOnSelectionChange({
    onChange: useCallback(({ nodes: selNodes }) => {
      setSelectedNodeIds(selNodes.map((n) => n.id));
    }, []),
  });

  // Centralized data-change callback.
  // The IndexedDB write is debounced (300ms) so typing in a CodeMirror card
  // doesn't hit the DB on every keystroke. The RF state update is immediate
  // (no debounce) so the UI stays responsive.
  const persistNodeData = useDebouncedCallback(
    (id: string, data: Record<string, unknown>) => {
      void canvasRepo.updateNode(id, { data });
    },
    300,
  );

  const onNodeDataChange = useCallback(
    (id: string, data: Record<string, unknown>) => {
      persistNodeData(id, data);
      setNodesState((ns) =>
        ns.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, ...data } } : n,
        ),
      );
    },
    [persistNodeData, setNodesState],
  );

  const onOpenNote = useCallback(
    (noteId: string) => {
      router.push(`/brain?note=${noteId}`);
    },
    [router],
  );

  const toFlowNode = useCallback(
    (n: CanvasNode): Node<AnyNodeData> => ({
      id: n.id,
      type: rfTypeFor(n.type),
      position: { x: n.x, y: n.y },
      data: {
        ...(n.data as AnyNodeData),
        shadow: settings.cardShadows,
        onDataChange: onNodeDataChange,
        onOpenNote,
      },
      style: { width: n.width, height: n.height },
    }),
    [onNodeDataChange, onOpenNote, settings.cardShadows],
  );

  // Seed RF state once per canvas from the database.
  useEffect(() => {
    if (!canvasId || dbNodes === undefined || dbEdges === undefined) return;
    if (seededRef.current === canvasId) return;
    seededRef.current = canvasId;
    setNodesState(dbNodes.map(toFlowNode));
    setEdgesState(
      dbEdges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? undefined,
        targetHandle: e.targetHandle ?? undefined,
        label: e.label || undefined,
        ...EDGE_DEFAULTS,
        ...(e.color ? { style: { stroke: e.color } } : {}),
      })),
    );
  }, [canvasId, dbNodes, dbEdges, toFlowNode, setNodesState, setEdgesState]);

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
      setEdgesState((es) =>
        addEdge({ ...connection, id: edge.id, ...EDGE_DEFAULTS }, es),
      );
    },
    [canvasId, setEdgesState],
  );

  const onNodeDragStop = useCallback((_evt: unknown, node: Node) => {
    void canvasRepo.updateNode(node.id, {
      x: node.position.x,
      y: node.position.y,
      ...(node.width ? { width: node.width } : {}),
      ...(node.height ? { height: node.height } : {}),
    });
  }, []);

  /* ── Node creation ──────────────────────────────────────────────────────── */

  const nextPosition = useCallback(() => {
    const i = nodes.length;
    return { x: 100 + (i % 6) * 48, y: 90 + (i % 6) * 44 };
  }, [nodes.length]);

  const addNode = useCallback(
    async (
      type: CanvasNode["type"],
      data: Record<string, unknown>,
      pos?: { x: number; y: number },
    ) => {
      if (!canvasId) return;
      const node = await canvasRepo.addNode({
        canvasId,
        type,
        x: (pos ?? nextPosition()).x,
        y: (pos ?? nextPosition()).y,
        data,
        width: type === "group" ? 400 : 280,
        height: type === "group" ? 300 : 160,
      });
      setNodesState((ns) => [...ns, toFlowNode(node)]);
    },
    [canvasId, nextPosition, setNodesState, toFlowNode],
  );

  const addTextNode = (pos?: { x: number; y: number }) =>
    addNode("text", { text: "" }, pos);
  const addNoteNode = (noteId: string, title: string, excerpt: string) =>
    addNode("note", { noteId, title, excerpt, mode: "preview" });
  const addGroupNode = () => addNode("group", { label: "New group" });

  const addWebNode = useCallback(
    async (url: string, pos?: { x: number; y: number }) => {
      const { detectWebKind } = await import("./nodes/types");
      const kind = detectWebKind(url);
      await addNode("link", { url, title: url, kind }, pos);
    },
    [addNode],
  );

  async function addMediaNodeFromFile(
    file: File,
    pos?: { x: number; y: number },
  ) {
    const mediaData = await fileToMediaNodeData(file);
    await addNode(
      "media",
      {
        attachmentId: mediaData.attachmentId,
        name: mediaData.name,
        mimeType: mediaData.mimeType,
        dataUrl: mediaData.dataUrl,
      },
      pos,
    );
  }

  /* ── Context menu actions ───────────────────────────────────────────────── */

  const duplicateNode = useCallback(
    async (id: string) => {
      const original = nodes.find((n) => n.id === id);
      if (!original || !canvasId) return;
      const dbNode = await canvasRepo.addNode({
        canvasId,
        type:
          rfTypeFor(original.type ?? "textNode") === "textNode"
            ? "text"
            : rfTypeFor(original.type ?? "textNode") === "noteNode"
              ? "note"
              : rfTypeFor(original.type ?? "textNode") === "mediaNode"
                ? "media"
                : rfTypeFor(original.type ?? "textNode") === "webNode"
                  ? "link"
                  : rfTypeFor(original.type ?? "textNode") === "groupNode"
                    ? "group"
                    : "text",
        x: original.position.x + 40,
        y: original.position.y + 40,
        width: original.width ?? 280,
        height: original.height ?? 160,
        data: { ...original.data },
      });
      setNodesState((ns) => [...ns, toFlowNode(dbNode)]);
    },
    [nodes, canvasId, setNodesState, toFlowNode],
  );

  const deleteNode = useCallback(
    (id: string) => {
      void canvasRepo.removeNode(id);
      setNodesState((ns) => ns.filter((n) => n.id !== id));
    },
    [setNodesState],
  );

  const changeNodeColor = useCallback(
    (id: string, color: string) => {
      void canvasRepo.updateNode(id, { color });
      setNodesState((ns) =>
        ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, color } } : n)),
      );
    },
    [setNodesState],
  );

  const toggleNodeLock = useCallback(
    (id: string) => {
      setNodesState((ns) =>
        ns.map((n) =>
          n.id === id
            ? {
                ...n,
                draggable: !n.draggable,
                data: { ...n.data, locked: !n.data.locked },
              }
            : n,
        ),
      );
    },
    [setNodesState],
  );

  const bringForward = useCallback(
    (id: string) => {
      const allNodes = getNodes();
      const maxZ = Math.max(0, ...allNodes.map((n) => n.zIndex ?? 0));
      setNodesState((ns) =>
        ns.map((n) => (n.id === id ? { ...n, zIndex: maxZ + 1 } : n)),
      );
    },
    [getNodes, setNodesState],
  );

  const sendBackward = useCallback(
    (id: string) => {
      const allNodes = getNodes();
      const minZ = Math.min(0, ...allNodes.map((n) => n.zIndex ?? 0));
      setNodesState((ns) =>
        ns.map((n) => (n.id === id ? { ...n, zIndex: minZ - 1 } : n)),
      );
    },
    [getNodes, setNodesState],
  );

  /* ── Alignment actions ──────────────────────────────────────────────────── */

  const applyAlignment = useCallback(
    (mode: AlignMode) => {
      const selNodes = getNodes().filter((n) => selectedNodeIds.includes(n.id));
      if (selNodes.length < 2) return;
      let posMap: Record<string, { x: number; y: number }>;
      switch (mode) {
        case "left":
          posMap = alignLeft(selNodes);
          break;
        case "right":
          posMap = alignRight(selNodes);
          break;
        case "top":
          posMap = alignTop(selNodes);
          break;
        case "bottom":
          posMap = alignBottom(selNodes);
          break;
        case "centerH":
          posMap = alignCenterH(selNodes);
          break;
        case "centerV":
          posMap = alignCenterV(selNodes);
          break;
        default:
          return;
      }
      setNodesState((ns) =>
        ns.map((n) => {
          const p = posMap[n.id];
          if (!p) return n;
          void canvasRepo.updateNode(n.id, { x: p.x, y: p.y });
          return { ...n, position: p };
        }),
      );
    },
    [getNodes, selectedNodeIds, setNodesState],
  );

  const applyDistribute = useCallback(
    (axis: "h" | "v") => {
      const selNodes = getNodes().filter((n) => selectedNodeIds.includes(n.id));
      if (selNodes.length < 3) return;
      const posMap =
        axis === "h" ? distributeH(selNodes) : distributeV(selNodes);
      setNodesState((ns) =>
        ns.map((n) => {
          const p = posMap[n.id];
          if (!p) return n;
          void canvasRepo.updateNode(n.id, { x: p.x, y: p.y });
          return { ...n, position: p };
        }),
      );
    },
    [getNodes, selectedNodeIds, setNodesState],
  );

  const applyAutoGrid = useCallback(
    (selectedOnly: boolean) => {
      const target = selectedOnly
        ? getNodes().filter((n) => selectedNodeIds.includes(n.id))
        : getNodes();
      if (target.length === 0) return;
      const posMap = autoGrid(target);
      setNodesState((ns) =>
        ns.map((n) => {
          const p = posMap[n.id];
          if (!p) return n;
          void canvasRepo.updateNode(n.id, { x: p.x, y: p.y });
          return { ...n, position: p };
        }),
      );
    },
    [getNodes, selectedNodeIds, setNodesState],
  );

  /* ── Context menu handlers ──────────────────────────────────────────────── */

  const onPaneContextMenu = useCallback((e: React.MouseEvent | MouseEvent) => {
    e.preventDefault();
    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      nodeId: null,
      multiSelect: false,
    });
  }, []);

  const onNodeContextMenu = useCallback(
    (e: React.MouseEvent | MouseEvent, node: Node) => {
      e.preventDefault();
      const multi =
        selectedNodeIds.length >= 2 && selectedNodeIds.includes(node.id);
      setCtxMenu({
        x: e.clientX,
        y: e.clientY,
        nodeId: node.id,
        multiSelect: multi,
      });
    },
    [selectedNodeIds],
  );

  /* ── OS drag-drop ───────────────────────────────────────────────────────── */

  function onDragOver(e: React.DragEvent) {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setDragOver(true);
    }
  }
  function onDragLeave() {
    setDragOver(false);
  }
  async function onDrop(e: React.DragEvent) {
    if (!e.dataTransfer.files.length) return;
    e.preventDefault();
    setDragOver(false);
    const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    for (const file of Array.from(e.dataTransfer.files)) {
      await addMediaNodeFromFile(file, pos);
    }
  }

  /* ── Keyboard shortcuts ─────────────────────────────────────────────────── */

  useCanvasShortcuts({
    onNewText: () => void addTextNode(),
    onDuplicate: () => {
      for (const id of selectedNodeIds) void duplicateNode(id);
    },
    onGroup: () => addGroupNode(),
    onSelectAll: () => {
      setNodesState((ns) => ns.map((n) => ({ ...n, selected: true })));
    },
  });

  /* ── AI context seam ────────────────────────────────────────────────────── */
  // Register imperative operations so the chat agent / workflow pipeline can
  // manipulate the canvas without coupling to the board's internals. Cleaned
  // up on unmount so a stale context is never left behind.
  useEffect(() => {
    const ctx: CanvasAIContext = {
      canvasId,
      canvasName: currentCanvas?.name ?? "Canvas",
      nodeCount: nodes.length,
      edgeCount: edges.length,
      nodes: nodes.map((n): CanvasNodeSummary => ({
        id: n.id,
        type: n.type ?? "text",
        title:
          (n.data as { title?: string }).title ??
          (n.data as { text?: string }).text?.split("\n")[0] ??
          "Untitled",
        position: n.position,
      })),
      addTextCard: async (text, pos) => {
        await addNode("text", { text }, pos);
        return nodes[nodes.length - 1]?.id ?? "";
      },
      addNoteCard: async (noteId, title, excerpt) => {
        await addNode("note", { noteId, title, excerpt, mode: "preview" });
        return nodes[nodes.length - 1]?.id ?? "";
      },
      addWebCard: async (url) => {
        await addWebNode(url);
        return nodes[nodes.length - 1]?.id ?? "";
      },
      addGroup: async (label) => {
        await addNode("group", { label });
        return nodes[nodes.length - 1]?.id ?? "";
      },
      autoArrange: (selectedOnly) => applyAutoGrid(selectedOnly ?? false),
      connect: async (fromId, toId, label) => {
        if (!canvasId) return "";
        const edge = await canvasRepo.addEdge({
          canvasId,
          source: fromId,
          target: toId,
          label: label ?? "",
        });
        setEdgesState((es) =>
          addEdge(
            { id: edge.id, source: fromId, target: toId, ...EDGE_DEFAULTS },
            es,
          ),
        );
        return edge.id;
      },
      deleteNode: (id) => deleteNode(id),
      summarize: () =>
        nodes.map((n): CanvasNodeSummary => ({
          id: n.id,
          type: n.type ?? "text",
          title:
            (n.data as { title?: string }).title ??
            (n.data as { text?: string }).text?.split("\n")[0] ??
            "Untitled",
          position: n.position,
        })),
    };
    setCanvasAIContext(ctx);
    return () => setCanvasAIContext(null);
  }, [
    canvasId,
    currentCanvas,
    nodes,
    edges,
    addNode,
    addWebNode,
    applyAutoGrid,
    deleteNode,
    setEdgesState,
  ]);

  /* ── Lifecycle ──────────────────────────────────────────────────────────── */

  async function createFirstCanvas() {
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
        description="Create a visual canvas to arrange notes, text cards, media, web embeds, and connections. Export and import Obsidian-compatible .canvas files."
        action={
          <Button onClick={createFirstCanvas}>
            <Plus className="h-4 w-4" /> New canvas
          </Button>
        }
      />
    );
  }

  const ctxTargetNode = ctxMenu?.nodeId
    ? {
        id: ctxMenu.nodeId,
        type: nodes.find((n) => n.id === ctxMenu.nodeId)?.type ?? "text",
      }
    : null;
  const ctxLocked = ctxMenu?.nodeId
    ? !!nodes.find((n) => n.id === ctxMenu.nodeId)?.data?.locked
    : false;

  return (
    <div className="flex h-full flex-col">
      <CanvasToolbar
        projectId={projectId}
        canvases={canvases ?? []}
        canvasId={canvasId}
        currentName={currentCanvas?.name ?? "Canvas"}
        onAddText={() => void addTextNode()}
        onAddNote={addNoteNode}
        projectNotes={projectNotes ?? []}
        onAddGroup={addGroupNode}
        onAddWeb={(url) => void addWebNode(url)}
      />

      <div
        className={
          "min-h-0 flex-1 " +
          (dragOver ? "ring-2 ring-primary/40 ring-inset" : "")
        }
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={(e) => void onDrop(e)}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDragStop={onNodeDragStop}
          onNodesDelete={(deleted) =>
            deleted.forEach((n) => void canvasRepo.removeNode(n.id))
          }
          onEdgesDelete={(deleted) =>
            deleted.forEach((e) => void canvasRepo.removeEdge(e.id))
          }
          onPaneContextMenu={onPaneContextMenu}
          onNodeContextMenu={onNodeContextMenu}
          onPaneClick={() => setCtxMenu(null)}
          nodeTypes={canvasNodeTypes}
          snapToGrid={settings.snapToGrid}
          snapGrid={[settings.gridSize, settings.gridSize]}
          minZoom={0.1}
          maxZoom={4}
          deleteKeyCode={["Delete", "Backspace"]}
          multiSelectionKeyCode={["Meta", "Control"]}
          selectionKeyCode="Shift"
          colorMode={resolvedTheme === "light" ? "light" : "dark"}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          {settings.showGrid ? (
            <Background
              variant={BackgroundVariant.Dots}
              gap={settings.gridSize}
              size={1}
            />
          ) : null}
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>

      {/* Context menu overlay */}
      <CanvasContextMenu
        coords={ctxMenu ? { x: ctxMenu.x, y: ctxMenu.y } : null}
        onClose={() => setCtxMenu(null)}
        onAddText={(pos) => void addTextNode(pos ?? undefined)}
        onAddNote={() => void addNoteNode("", "", "")}
        onAddWeb={() => {
          // Open the web dialog via a custom event the toolbar listens to.
          window.dispatchEvent(new CustomEvent("canvas:add-web"));
        }}
        onAddGroup={addGroupNode}
        targetNode={ctxTargetNode}
        onDuplicate={(id) => void duplicateNode(id)}
        onDelete={(id) => deleteNode(id)}
        onChangeColor={(id, c) => changeNodeColor(id, c)}
        onToggleLock={(id) => toggleNodeLock(id)}
        onBringForward={(id) => bringForward(id)}
        onSendBackward={(id) => sendBackward(id)}
        locked={ctxLocked}
        multiSelect={ctxMenu?.multiSelect ?? false}
        selectedCount={selectedNodeIds.length}
        onAlign={(mode) => applyAlignment(mode)}
        onDistribute={(axis) => applyDistribute(axis)}
        onAutoGrid={() => applyAutoGrid(true)}
      />
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
